'use strict';

const DMSAPI = require('./dmsapi.js');
var messages = undefined;
if (!DMSAPI.DEBUG) {
    messages = require('elasticio-node').messages;
}

//var self = this;
function emitSnapshot(scope, snapshot) {
    DMSAPI.Log('emitSnapshot: ' + JSON.stringify(snapshot), 'debug');
    if (messages !== undefined) {
        scope.emit('snapshot', snapshot);
    }
};

function emitData(scope, data) {
    DMSAPI.Log('emitData: ' + JSON.stringify(data), 'debug');
    if (messages !== undefined) {
        scope.emit('data', messages.newMessageWithBody(data));
    }
};

function emitError(scope, err) {
    console.error(`emitError: ${err}`);
    if (messages !== undefined) {
        scope.emit('error', err);
    }
};

function emitEnd(scope) {
    DMSAPI.Log('emitEnd', 'debug');
    if (messages !== undefined) {
        scope.emit('end');
    }
};


module.exports.emitSnapshot = emitSnapshot;
module.exports.emitData = emitData;
module.exports.emitError = emitError;
module.exports.emitEnd = emitEnd;