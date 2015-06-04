var debug = require('debug')('LeanCloudStore');
var AV = require('leanengine');
var util = require('util');
var noop = function () {
};

module.exports = function (session) {
	var Store = session.Store;

	function LeanCloudStore(options) {
		this.state = 'unlock';
		var self = this;
		options = options || {};

		Store.call(this, options);

		this.prefix = options.prefix == null
			? 'sess:'
			: options.prefix;
		this.class = options.class == null
			? 'Session'
			: options.class;

		var APP_ID = process.env.LC_APP_ID;
		var APP_KEY = process.env.LC_APP_KEY;
		var MASTER_KEY = process.env.LC_APP_MASTER_KEY;
		AV.initialize(APP_ID, APP_KEY, MASTER_KEY);

		this.classObj = AV.Object.extend(this.class);

		this.on('lock', function () {
			self.state = 'locked';
			debug('LOCKED: '+ (new Date).toString);
		});

		this.on('unlock', function () {
			self.state = 'unlock';
			debug('UNLOCKED: '+ (new Date).toString);
		});

		this.getClass = function (done) {
			switch (self.state) {
				case 'locked':
					self.once('unlock', function () {
						done(null, self.classObj);
					});
					break;
				case 'unlock':
					done(null, self.classObj);
					break;
				default:
					done(new Error('Unknown state'));
					break;
			}
		}
	}

	util.inherits(LeanCloudStore, Store);

	LeanCloudStore.prototype.get = function (sid, fn) {
		var store = this;
		var psid = store.prefix + sid;
		if (!fn) fn = noop;

		try {
			store.getClass(function (er, classObj) {
				if (er) return fn(er);
				store.emit('lock');

				debug('GET "%s"', sid);
				var query = new AV.Query(classObj);
				query.equalTo('sid', psid);
				query.find().then(function (result) {
					if (result.length > 0) {
						var value = result[0].get('value');
						debug('GOT "%s"', value);
						fn(null, JSON.parse(value));
					} else {
						fn();
					}

					store.emit('unlock');
				});
			});
		} catch (er) {
			console.log(er);
			return fn(er);
		}
	}

	LeanCloudStore.prototype.set = function (sid, sess, fn) {
		var store = this;
		var psid = store.prefix + sid;
		if (!fn) fn = noop;

		try {
			var jsess = JSON.stringify(sess);
			store.getClass(function (er, classObj) {
				if(er) return fn(er);
				store.emit('lock');

				debug('SET "%s" %s', sid, jsess);
				var query = new AV.Query(classObj);
				query.equalTo('sid', psid);
				query.find().then(function (result) {

					if (result.length > 0) {
						result[0].set('value', jsess);
						result[0].save();
					} else {
						var AVSession = new classObj();
						AVSession.set('sid', psid);
						AVSession.set('value', jsess);
						AVSession.save();
						debug('SET NEW SESSION "%s" %s', sid, jsess);
					}
					debug('SET complete');
					fn.apply(null);

					store.emit('unlock');
				});
			});

		} catch (er) {
			console.log(er);
			return fn(er);
		}
	}

	LeanCloudStore.prototype.destroy = function (sid, fn) {
		var sid = this.prefix + sid;
		if (!fn) fn = noop;
		try {
			store.getClass(function(er,classObj){
				store.emit('lock');
				debug('DEL "%s"', sid);
				var query = new AV.Query(classObj);
				query.equalTo('sid', psid);
				query.find().then(function (result) {
					if (result.length > 0) {
						result[0].destroy();
						fn.apply(null, arguments);
					}
					store.emit('unlock');
				});
			});

		} catch (er) {
			console.log(er);
			return fn(er);
		}
	}

	return LeanCloudStore;
}
