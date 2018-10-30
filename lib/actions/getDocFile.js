'use strict';

const DMSAPI = require('../dmsapi.js');
const EIO = require('../eio-tools.js');
const rp = require('request-promise-native');
const mime = require('mime-types');
var client = undefined;
if (!DMSAPI.DEBUG) {
    client = require('elasticio-rest-node')();
}

/**
 * uploads an attachment to the platform
 * @param {Dictionary} inMeta metadata containing "content-type"
 * @param {Buffer} inData data to upload
 */
async function addAttachment(inMeta, inData) {
    const result = { result: false, message: '', response: null, get_url: '' };
    DMSAPI.Log('addAttachment: ' + JSON.stringify(inMeta) + ' (' + inData.length + ' Bytes)', 'debug');

    const oRes = await client.resources.storage.createSignedUrl();
    DMSAPI.Log('put_url: ' + oRes.put_url, 'debug', 2);
    DMSAPI.Log('get_url: ' + oRes.get_url, 'debug' ,2);

    var oHeaders = {
        "Content-Length": inData.length,
        "Content-Type": inMeta["content-type"]
    };
    try {
        result.response = await DMSAPI.DoRequest(oRes.put_url, 'PUT', inData, oHeaders);
        if (result.response.statusCode === 200) {
            result.get_url = oRes.get_url;
            result.message = result.response.body;
            result.result = true;
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
            result.response.options.body = {};
            DMSAPI.Log(JSON.stringify(result.response), 'debug');
        }
    } catch (ex) {
        result.message = (ex.statusCode + ' ' + ex.error + ' ' + ex.message).trim();
    }
    return result;
};

async function processAction(msg, cfg, snapshot) {
    const oDMS = new DMSAPI(snapshot);
    const oRes = await oDMS.Login(DMSAPI.TrimURL(cfg.dms_url) + '/dms', cfg.dms_user, cfg.dms_pass);
    if (oRes.result) {
        const oRes = await oDMS.DocFile(msg.body.docID);
        if (oRes.result) {
            var sFilename = '';
            if (DMSAPI.TypeOf(oRes.response.headers['content-disposition'], String)) {
                var oMatch = oRes.response.headers['content-disposition'].match(/(filename=\")(.+\..+)(\")/i);
                if (DMSAPI.TypeOf(oMatch, Array) && (oMatch.length === 4)) {
                    sFilename = oMatch[2];
                }
            }
            if (sFilename === '') {
                var sExt = mime.extension(oRes.response.headers['content-type']);
                if (DMSAPI.TypeOf(sExt, String)) {
                    sExt = '.' + sExt;
                    sFilename = msg.body.docID + sExt;
                }
            }
            DMSAPI.Log('docfile ok: ' + sFilename, 'debug');
            const oAttachment = {
                "content-type": oRes.response.headers["content-type"]
            };
            const oResAttach = await addAttachment(oAttachment, oRes.response.body);
            if (oResAttach.result) {
                msg.attachments[sFilename] = {
                    url: oResAttach.get_url,
                    size: oRes.response.body.length,
                    "content-type": oAttachment["content-type"]
                };
                DMSAPI.Log(JSON.stringify(msg), 'debug', 2);
                EIO.emitData(this, {
                    result: oResAttach.result,
                    message: oResAttach.message,
                    attachment: {
                        name: sFilename,
                        url: oResAttach.get_url,
                        size: oRes.response.body.length,
                        "content-type": oAttachment["content-type"]
                    }
                });
            } else {
                EIO.emitError(this, 'addAttachment failed: ' + oResAttach.message);
            }
        } else {
            EIO.emitError(this, 'search failed: ' + oRes.message);
        }
        var iSnapLevel = ((DMSAPI.TypeOf(process.env.DMS_SNAPSHOT_LEVEL, String) && (process.env.DMS_SNAPSHOT_LEVEL !== '')) ? Number(process.env.DMS_SNAPSHOT_LEVEL) : 2);
        if (iSnapLevel === 0) {
            await oDMS.Logout();
            oDMS.foData = {};
        } else if (iSnapLevel > 0) {
            if (iSnapLevel === 1) {
                oDMS.foData.products = [];
            }
        }
        EIO.emitSnapshot(this, oDMS.foData);
    } else {
        EIO.emitError(this, 'login failed: ' + oRes.message);
    }
    //EIO.emitEnd(this);
};

exports.process = processAction;