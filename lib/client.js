'use strict';
const net = require('net');

function winsipbrowserClient(adapter) {
    if (!(this instanceof winsipbrowserClient)) return new winsipbrowserClient(adapter);

    let client = null;
    let connected = false;
    let tout_error;
    let tout_close;
    let tout_timeout;
    let pages = [];
    let speak = [];
    let intervalObj = null;
    let index = 0;

    this.destroy = () => {
        if (client) {
            clearInterval(intervalObj);
            clearTimeout(tout_error);
            clearTimeout(tout_close);
            clearTimeout(tout_timeout);
            tout_error = null;
            tout_close = null;
            tout_timeout = null;
            intervalObj = null;
            client.destroy();
            client = null;
        }
    };

    this.onStateChange = (id, state) => send2Server(id, state);

    function send2winsipbrowser(str) {
        if (connected) {
            client.write(str + '\r\n');
        } else {
            clearInterval(intervalObj);
        }
    }

    function send2Server(id, state) {
        adapter.log.debug('stateChange ' + id + ': ' + JSON.stringify(state));
        const dp = (id.split('.'));
        switch (dp[2]) {
            case ('brightness'):
                send2winsipbrowser('brightness|' + state.val);
                break;
            case ('volume'):
                send2winsipbrowser('volume|' + state.val);
                break;
            case ('mute'):
                if (state.val) {
                    send2winsipbrowser('mute|true');
                } else {
                    send2winsipbrowser('mute|false');
                }
                break;
            case ('screenon'):
                if (state.val) {
                    send2winsipbrowser('screenon|true');
                    adapter.setState('screenon', false, true);
                }
                break;
            case ('screenoff'):
                if (state.val) {
                    send2winsipbrowser('screenoff|true');
                    adapter.setState('screenoff', false, true);
                }
                break;
            case ('close'):
                if (state.val) {
                    send2winsipbrowser('close|true');
                    adapter.setState('close', false, true);
                }
                break;
            case ('command'):
                send2winsipbrowser('command|' + state.val.replace(' ', '|'));
                break;
            case ('web'):
                switch (dp[3]) {
                    case ('sendURL'):
                        send2winsipbrowser('sendUrl|' + state.val);
                        adapter.setState('web.error', false, true);
                        break;
                    case ('zoom'):
                        send2winsipbrowser('zoom|' + state.val);
                        break;
                    case ('slide'):
                        if (state.val) {
                            if (connected) {
                                slideshow();
                            } else {
                                adapter.setState('web.slide', false, true);
                            }
                        } else {
                            clearInterval(intervalObj);
                        }
                        break;
                }
                break;
            case ('messages'):
                switch (dp[3]) {
                    case ('texttospeech'):
                        send2winsipbrowser('texttospeech|' + state.val);
                        break;
                    case ('speakmessage'):
                        if ((speak.length >= state.val) && (state.val > 0)) {
                            send2winsipbrowser('texttospeech|' + speak[state.val - 1].text);
                        }
                        break;
                }
        }
    }

    function slideshow() {
        if (pages.length > 0) {
            adapter.log.debug(pages[index].name);
            send2winsipbrowser('sendUrl|' + pages[index].name);
            adapter.setState('web.error', false, true);
            if (pages[index].zoom) {
                send2winsipbrowser('zoom|' + pages[index].zoom);
            } else {
                send2winsipbrowser('zoom|1');
            }
            clearInterval(intervalObj);
            if (pages[index].time) {
                intervalObj = setInterval(slideshow, pages[index].time * 1000);
            } else {
                intervalObj = setInterval(slideshow, 10000);
            }
            ++index;
            if (index >= pages.length) index = 0;
        }
    }

    (function _constructor(config) {
        pages = config.pages;
        speak = config.speak;
        client = new net.Socket();
        client.connect(config.port, config.url, () => { });
        client.setKeepAlive(true, 30000);

        client.on('data', function (data) {
            try {
                const obj = JSON.parse(data.toString('utf8'));
                adapter.log.debug('Typ: ' + obj.TYP);
                switch (obj.TYP) {
                    case ('URL'):
                        adapter.setState('web.receiveURL', obj.URL, true);
                        break;
                    case ('BATTERY'):
                        adapter.setState('info.battery', Number(obj.BATTERY), true);
                        break;
                    case ('CPU'):
                        adapter.setState('info.cpu', Number(obj.CPU), true);
                        break;
                    case ('IP'):
                        adapter.setState('info.ip', obj.IP, true);
                        break;
                    case ('HOST'):
                        adapter.setState('info.host', obj.HOST, true);
                        break;
                    case ('MEMORY'):
                        adapter.setState('info.memory', Number((parseInt(obj.MEMORY) / 1000000).toFixed(2)), true);
                        break;
                    case ('EVENT'):
                        if (obj.EVENT == 'GOTFOCUS') {
                            adapter.getState('web.slide', function (err, state) {
                                if (state.val) adapter.setState('web.slide', false, false);
                            });
                        }
                        break;
                    case ('ERROR'):
                        if (obj.ERROR == 'TRUE') {
                            adapter.setState('web.error', true, true);
                        }
                        break;
                    case ('VOLUME'):
                        adapter.setState('volume', Number(obj.VOLUME), true);
                        break;
                    case ('MUTE'):
                        if (obj.MUTE == 'TRUE') {
                            adapter.setState('mute', true, true);
                        } else {
                            adapter.setState('mute', false, true);
                        }
                        break;
                }
            } catch (err) {
                adapter.log.debug(err);
            }
        });

        client.on('connect', () => {
            adapter.log.info('Connected to ' + config.url);
            connected = true;
            adapter.setState('info.connection', connected, true);
        });

        client.on('error', err => {
            adapter.log.debug('Client error:' + err);

            if (connected) {
                adapter.log.info('Disconnected from ' + config.url);
                connected = false;
                adapter.setState('info.connection', connected, true);
            }
            tout_error = setTimeout(() => {
                tout_error = null;
                _constructor(config);
            }, 10000);
        });

        client.on('close', () => {
            if (connected) {
                adapter.log.info('Disconnected from ' + config.url);
                connected = false;
                adapter.setState('info.connection', connected, true);
                tout_close = setTimeout(() => {
                    tout_close = null;
                    _constructor(config);
                }, 10000);
            }
        });
    })(adapter.config);

    process.on('uncaughtException', err => adapter.log.debug('uncaughtException: ' + err));

    return this;
}

module.exports = winsipbrowserClient;
