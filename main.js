/*
 *
 *      ioBroker winsipbrowser Adapter
 *
 *      (c) 2022 bettman66<w.zengel@gmx.de>
 *
 *      MIT License
 *
 */

'use strict';

const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const adapterName = require('./package.json').name.split('.').pop();
const Server = require('./lib/server');
let server = null;
let adapter;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, { name: adapterName });

    adapter = new utils.Adapter(options);

    adapter.on('ready', function () {
        main();
    });

    adapter.on('unload', function (callback) {
        if (server) server.destroy();
        callback();
    });

    adapter.on('stateChange', (id, state) => {
        if (state && !state.ack) {
            server.onStateChange(id, state);
        }
    });
    return adapter;
}

function main() {
    adapter.subscribeStates('*');

    server = new Server(adapter);
}

// If started as allInOne/compact mode => return function to create instance
// @ts-ignore
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
