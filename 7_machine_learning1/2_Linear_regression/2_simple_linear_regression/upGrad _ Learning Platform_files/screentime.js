/*!
 * @preserve
 * Screentime.js | v0.2.0
 * Copyright (c) 2016 Rob Flaherty (@robflaherty)
 * Licensed under the MIT and GPL licenses.
 */
/* Universal module definition */
	/* Screentime */
	screentime = function(options) {
		var defaults = {
			fields: [],
			preventEmptyCallback: false,
			percentOnScreen: '50%',
			reportInterval: 10,
			googleAnalytics: false,
			callback: function() {}
		};
		options = Object.assign(defaults, options);
		// Convert perecent string to number
		options.percentOnScreen = parseInt(options.percentOnScreen.replace('%', ''), 10);
		var counter = {};
		var cache = {};
		var lastHiddenState = null;
		var lastVisibleState = null;
		var log = {};
		var looker = null;
		var started = false;
		var universalGA, classicGA;
		if (!options.fields.length && options.preventEmptyCallback) {
			return;
		}
		if (options.googleAnalytics) {
			if (typeof ga === "function") {
				universalGA = true;
			}
			if (typeof _gaq !== "undefined" && typeof _gaq.push === "function") {
				classicGA = true;
			}
		}
		/*
		 * Utilities
		 */
		/*!
		 * visibly - v0.6 Aug 2011 - Page Visibility API Polyfill
		 * http://github.com/addyosmani
		 * Copyright (c) 2011 Addy Osmani
		 * Dual licensed under the MIT and GPL licenses.
		 *
		 * Methods supported:
		 * visibly.onVisible(callback)
		 * visibly.onHidden(callback)
		 * visibly.hidden()
		 * visibly.visibilityState()
		 * visibly.visibilitychange(callback(state));
		 */
		(function() {
			window.visibly = {
				q: document,
				p: undefined,
				prefixes: ["webkit", "ms", "o", "moz", "khtml"],
				props: ["VisibilityState", "visibilitychange", "Hidden"],
				m: ["focus", "blur"],
				visibleCallbacks: [],
				hiddenCallbacks: [],
				genericCallbacks: [],
				_callbacks: [],
				cachedPrefix: "",
				fn: null,
				onVisible: function(i) {
					if (typeof i == "function") {
						this.visibleCallbacks.push(i)
					}
				},
				onHidden: function(i) {
					if (typeof i == "function") {
						this.hiddenCallbacks.push(i)
					}
				},
				getPrefix: function() {
					if (!this.cachedPrefix) {
						for (var i = 0; b = this.prefixes[i++];) {
							if (b + this.props[2] in this.q) {
								this.cachedPrefix = b;
								return this.cachedPrefix
							}
						}
					}
				},
				visibilityState: function() {
					return this._getProp(0)
				},
				hidden: function() {
					return this._getProp(2)
				},
				visibilitychange: function(i) {
					if (typeof i == "function") {
						this.genericCallbacks.push(i)
					}
					var t = this.genericCallbacks.length;
					if (t) {
						if (this.cachedPrefix) {
							while (t--) {
								this.genericCallbacks[t].call(this, this.visibilityState())
							}
						} else {
							while (t--) {
								this.genericCallbacks[t].call(this, arguments[0])
							}
						}
					}
				},
				isSupported: function(i) {
					return this.cachedPrefix + this.props[2] in this.q
				},
				_getProp: function(i) {
					return this.q[this.cachedPrefix + this.props[i]]
				},
				_execute: function(i) {
					if (i) {
						this._callbacks = i == 1 ? this.visibleCallbacks : this.hiddenCallbacks;
						var t = this._callbacks.length;
						while (t--) {
							this._callbacks[t]()
						}
					}
				},
				_visible: function() {
					window.visibly._execute(1);
					window.visibly.visibilitychange.call(window.visibly, "visible")
				},
				_hidden: function() {
					window.visibly._execute(2);
					window.visibly.visibilitychange.call(window.visibly, "hidden")
				},
				_nativeSwitch: function() {
					this[this._getProp(2) ? "_hidden" : "_visible"]()
				},
				_listen: function() {
					try {
						if (!this.isSupported()) {
							if (this.q.addEventListener) {
								window.addEventListener(this.m[0], this._visible, 1);
								window.addEventListener(this.m[1], this._hidden, 1)
							} else {
								if (this.q.attachEvent) {
									this.q.attachEvent("onfocusin", this._visible);
									this.q.attachEvent("onfocusout", this._hidden)
								}
							}
						} else {
							this.q.addEventListener(this.cachedPrefix + this.props[1], function() {
								window.visibly._nativeSwitch.apply(window.visibly, arguments)
							}, 1)
						}
					} catch (i) {}
				},
				init: function() {
					this.getPrefix();
					this._listen()
				}
			};
			this.visibly.init()
		})();
		/*
		 * Constructors
		 */
		function Field(fieldObj) {
			this.selector = document.querySelector(fieldObj.selector);
			var bounding = this.selector.getBoundingClientRect();
			this.top = bounding.top;
			this.left = bounding.left;
			this.right = bounding.right;
			this.height = bounding.height;
			this.bottom = bounding.bottom;
			this.name = fieldObj.name;
		}
		function Viewport() {
			this.top = 0;
			this.height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
			this.bottom = this.height;
			this.width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
		}
		/*
		 * Do Stuff
		 */
		function sendGAEvent(field, time) {
			if (universalGA) {
				ga('send', 'event', 'Screentime', 'Time on Screen', field, parseInt(time, 10), {
					'nonInteraction': true
				});
			}
			if (classicGA) {
				_gaq.push(['_trackEvent', 'Screentime', 'Time on Screen', field, parseInt(time, 10), true]);
			}
		}
		function setCache() {
			options.fields.forEach(
				(fieldObj, index) => {
					if (document.querySelector(fieldObj.selector)) {
						var field = new Field(fieldObj);
						cache[field.name] = field;
					}
				}
			);
		}
		function unsetCounter() {
			const keys = Object.keys(cache)
			for (const key of keys) {
				log[key] = 0;
				counter[key] = 0;
			}
		}
		function checkViewport() {
			var viewport = new Viewport();
			function onScreen(viewport, field) {
				var cond, buffered, partialView;
				// Field entirely within viewport
				if (field.top >= viewport.top && (field.bottom <= viewport.bottom)) {
					return true;
				}
				//field out of viewport
				else if ((field.top > viewport.height) || (field.bottom < viewport.top)){
					return false
				}
				//field overflows viewport
				else if (field.bottom >= viewport.height && field.top <= viewport.top ) {
					return true;
				}
				// Partially in view
				buffered = (field.height * (options.percentOnScreen / 100));
				partialView = ((field.bottom - buffered) > viewport.top) && (field.top + buffered <= viewport.bottom) ;
				return partialView;
			}
			const keys = Object.keys(cache)
			for (const key of keys) {
				let val = cache[key]
				if (val.selector.style.display != "none" & onScreen(viewport, val)) {
					log[key] += 1;
					counter[key] += 1;
				}
			}
		}
		function report() {
			function isEmpty(obj) {
			    for(var key in obj) {
			        if(obj.hasOwnProperty(key))
			            return false;
			    }
			    return true;
			}
			var data = {};
			if (lastVisibleState && lastHiddenState){
				data.inactiveTime = (lastVisibleState - lastHiddenState)/ 1000
			}
			lastVisibleState = null
			lastHiddenState = null
			const keys = Object.keys(counter)
			for (const key of keys) {
				let val = counter[key]
				if (val > 0) {
					data[key] = val;
					counter[key] = 0;
					if (options.googleAnalytics) {
						sendGAEvent(key, val);
					}
				}
			}
			if (!isEmpty(data) || !options.preventEmptyCallback) {
				options.callback.call(this, data, log);
			}
		}
		function logVisibleItems() {
			//reset cache to check if any field is being hidden
			setCache()
			unsetCounter()
			checkViewport();
		}
		function startTimers() {
			if (!started) {
				logVisibleItems()
				started = true;
			}
			looker = setInterval(function() {
				logVisibleItems()
			}, 1000);
			reporter = setInterval(function() {
				report();
			}, options.reportInterval * 1000);
		}
		function stopTimers() {
			clearInterval(looker);
			clearInterval(reporter);
		}
		screentime.reset = function() {
			stopTimers();
			unsetCounter()
			startTimers();
		}
		screentime.destroy = function() {
			stopTimers();
			unsetCounter();
			options.fields=  [];
			options.preventEmptyCallback = true;
			return;
		}
		function init() {
			startTimers();
			visibly.onHidden(function() {
				lastHiddenState = new Date().getTime()
				stopTimers();
			});
			visibly.onVisible(function() {
				if (!options.fields.length && options.preventEmptyCallback) {
					return;
				}
				lastVisibleState = new Date().getTime()
				stopTimers();
				startTimers();
			});
		}
		init();
	};