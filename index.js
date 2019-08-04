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
	this.url = "";		// Telegram URL
	this.messages = {}; // collected messages
	this.interval = [];
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
	// sort per-device notifications by id and value to ensure complete matches are found first
	config.deviceNotifications.sort(function (x, y) {
		if (x.deviceId && !y.deviceId || x.value && !y.value) {
			return -1;
		}
		return 1;
	})
	// event handler for notifications
	this.notificationHandler = function (notification) {
		// react to device notifications only
		if (notification.level.indexOf('device') < 0) {
			return;
		}
		// look for device/value specific text: first device and value then device without value
		var device = self.find(config.deviceNotifications, function (x) {
			return x.deviceId === notification.source && (x.value === notification.message.l || !x.value);
		});
		var message = "";
		// device not configured, but everything forwarded
		if (device === false && config.forwardAllNotifications) {
			message = self.compose(config.defaultMessage, notification);
			if (config.collectDefaultMessages) {
				self.collect(notification, message);
				return;
			}
			// device found and not ignored
		} else if (device.deviceId !== "" && device.options !== 'ignore') {
			message = self.compose(device.message ? device.message : config.defaultMessage, notification);
			if (device.options == 'collect') {
				self.collect(notification, message);
				return;
			}
		}
		self.send(message);
	};
	// schedule periodic transfer for collected messages
	if (config.collectDefaultMessages || config.deviceNotifications.some(function (x) { return x.options === 'collect' })) {
		// parse time string into timestamp array
		var now = new Date(Date.now());
		this.interval = config.notificationInterval.split(',')
			.map(function (x) {
				var time = x.trim().split(':');
				return new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(time[0]), parseInt(time[1])).getTime();
			})
			.sort(function (x, y) {
				return x > y;
			});
		this.collector = function () {
			self.send(JSON.stringify(self.messages));
			self.length = 0;
			clearTimeout(self.collector);
			self.schedule();
		}
		this.schedule();
	}
	// register notification handler
	self.controller.on('notifications.push', this.notificationHandler);
};

TelegramNotifier.prototype.stop = function () {
	TelegramNotifier.super_.prototype.stop.call(this);
	this.controller.off('notifications.push', this.notificationHandler);
};

// ----------------------------------------------------------------------------
// --- Module functions
// ----------------------------------------------------------------------------
// for a comparison of prototype vs objects methods see:
// https://veerasundar.com/blog/2014/02/javascript-prototype-methods-vs-object-methods/
// ----------------------------------------------------------------------------
TelegramNotifier.prototype.oneDay = 24 * 60 * 60 * 1000;

TelegramNotifier.prototype.compose = function (message, notification) {
	return message
		.replace('$TIME', notification.timestamp)
		.replace('$DEVICE', notification.message.dev)
		.replace('$VALUE', notification.message.l);
}

TelegramNotifier.prototype.collect = function (notification, message) {
	if (typeof this.messages[notification.message.dev] === 'undefined') {
		this.messages[notification.message.dev] = [];
	}
	this.messages[notification.message.dev].push({
		'time': notification.timestamp,
		'message': message
	});
}

TelegramNotifier.prototype.send = function (message) {
	var self = this;
	http.request({
		method: "POST",
		url: self.url,
		async: true,
		data: {
			chat_id: config.chatId,
			text: message
		},
		complete: function (response) {
			// log success and/or error messages
			if (response.status == 200 && config.logLevel == 2) {
				self.addNotification('info', 'Sent Telegram Notification: ' + JSON.stringify(notification), 'module');
			} else if (response.status > 200 && config.logLevel > 0) {
				self.addNotification('error', 'Error sending Telegram notification: ' + (typeof response !== 'string' ? JSON.stringify(response) : response), 'module');
			}
		}
	});
}

TelegramNotifier.prototype.schedule = function () {
	var now = Date.now();
	// try to find next or previous run time
	var next = this.indexOf(this.interval, function (x) { return x > now });
	if (next === -1) {
		next = this.indexOf(this.interval, function (x) { return x < now });
		this.interval[next] += this.oneDay;
	}
	// console.debug("[telegram] notification scheduled for " + new Date(this.interval[next]));
	setTimeout(this.collector, this.interval[next] - now);
}

TelegramNotifier.prototype.indexOf = function (array, func) {
	for (var i = 0; i < array.length; i++) {
		if (func(array[i]) === true) {
			return i;
		}
	}
	return -1;
}

TelegramNotifier.prototype.find = function (array, func) {
	for (var i = 0; i < array.length; i++) {
		if (func(array[i]) === true) {
			return array[i];
		}
	}
	return false;
}