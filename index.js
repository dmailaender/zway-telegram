/**
 * Telegram notifier for Z-Way Home Automation server.
 *
 * Module for the Z-Way Home Automation server that forwards notifications to a 
 * Telegram chat via the Bot API. Messages can be customized by device/value
 * through the app settings, no separate virtual device is needed.
 *
 * Written by David Mailänder <david@mailaender.it> in July 2019 and published
 * on https://gitlab.com/ailaender.it/telegram-notifier under the GNU GPLv3.
 *
 * Visit our blog https://mailaender.it for more information about Z-Wave, home
 * automation and software development.
 * 
 * Copyright 2019 David Mailänder 
 * 
 **/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------
function TelegramNotifier(id, controller) {
	TelegramNotifier.super_.call(this, id, controller);
	this.url = null;
};

inherits(TelegramNotifier, AutomationModule);
_module = TelegramNotifier;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------
TelegramNotifier.prototype.init = function (config) {
	TelegramNotifier.super_.prototype.init.call(this, config);
	var self = this;
	this.url = "https://api.telegram.org/bot" + config.token + "/sendMessage";
	// sort devices by id and value to ensure complete matches are found first
	config.devices.sort(function (x, y) {
		if (x.device_id && !y.device_id || x.value && !y.value) {
			return -1;
		}
		return 1;
	})
	// notification handler
	this.notificationHandler = function (notification) {
		// react to device notifications only
		if (notification.level.indexOf('device') < 0) {
			return;
		}
		// look for device/value specific text: device and value, device without value, default = no device and no value		
		var text = config.devices.filter(function (x) {
			return (x.device_id == notification.source && x.value == notification.message.l) || (x.device_id == notification.source && !x.value) || (!x.device_id && !x.value);
		});
		// not found, compose default message "<device>: <value>"
		if (typeof text[0] === 'undefined') {
			text = notification.message.dev + ": " + notification.message.l;
			// otherwise use supplied message replacing $DEVICE and $VALUE
		} else {
			text = text[0].message.replace('$DEVICE', notification.message.dev).replace('$VALUE', notification.message.l);
		}
		// send Telegram API notification
		http.request({
			method: "POST",
			url: self.url,
			async: true,
			data: {
				chat_id: config.chat_id,
				text: text
			},
			complete: function (response) {
				// log success and/or error messages
				if (response.status == 200 && config.log_level == 2) {
					self.addNotification('info', 'Sent Telegram Notification: ' + JSON.stringify(notification), 'module');
				} else if (response.status > 200 && config.log_level > 0) {
					self.addNotification('error', 'Error sending Telegram notification: ' + (typeof response !== 'string' ? JSON.stringify(response) : response), 'module');
				}
			}
		});
	};
	// register notification handler
	self.controller.on('notifications.push', self.notificationHandler);
};

TelegramNotifier.prototype.stop = function () {
	TelegramNotifier.super_.prototype.stop.call(this);
	this.controller.off('notifications.push', this.notificationHandler);
};
