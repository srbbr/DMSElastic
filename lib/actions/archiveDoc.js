'use strict';

const DMSAPI = require('../dmsapi.js');
const EIO = require('../eio-tools.js');
const mime = require('mime-types');

async function processAction(msg, cfg, snapshot) {
    const oDMS = new DMSAPI(snapshot);
    const oRes = await oDMS.Login(DMSAPI.TrimURL(cfg.dms_url) + '/dms', cfg.dms_user, cfg.dms_pass);
    if (oRes.result) {
        const oArchive = {
            filename: '',
            productid: -1,
            clientid: -1,
            yearid: -1,
            doctypeid: -1,
            indexvalues: [],
            // protection: 0,
            // tag: [],
            versioning: false
        };
        var bTemp = false;
        for (var iIndex = 0; iIndex < msg.body.indexes.length; iIndex++) {
            if (msg.body.indexes[iIndex].id === 16) {
                const oRes = await oDMS.GetProductByName(msg.body.indexes[iIndex].value);
                if (oRes.result) {
                    oArchive.productid = oRes.response.id;
                    bTemp = true;
                } else {
                    EIO.emitError(this, 'cannot find product: ' + msg.body.indexes[iIndex].value);
                }
                msg.body.indexes.splice(iIndex, 1);
                break;
            }
        }
        if (bTemp) {
            var bTemp = false;
            for (var iIndex = 0; iIndex < msg.body.indexes.length; iIndex++) {
                if (msg.body.indexes[iIndex].id === 24) {
                    const oRes = await oDMS.GetClientByName(oArchive.productid, msg.body.indexes[iIndex].value);
                    if (oRes.result) {
                        oArchive.clientid = oRes.response.id;
                        bTemp = true;
                    } else {
                        EIO.emitError(this, 'cannot find client: ' + msg.body.indexes[iIndex].value);
                    }
                    msg.body.indexes.splice(iIndex, 1);
                    break;
                }
            }
        }
        if (bTemp) {
            var bTemp = false;
            for (var iIndex = 0; iIndex < msg.body.indexes.length; iIndex++) {
                if (msg.body.indexes[iIndex].id === 5) {
                    const oRes = await oDMS.GetYearByDate(oArchive.productid, oArchive.clientid, msg.body.indexes[iIndex].value);
                    if (oRes.result) {
                        oArchive.yearid = oRes.response.id;
                        bTemp = true;
                    } else {
                        EIO.emitError(this, 'cannot find year: ' + msg.body.indexes[iIndex].value);
                    }
                    //msg.body.indexes.splice(iIndex, 1);
                    break;
                }
            }
        }
        if (bTemp) {
            var bTemp = false;
            for (var iIndex = 0; iIndex < msg.body.indexes.length; iIndex++) {
                if (msg.body.indexes[iIndex].id === 100) {
                    const oRes = await oDMS.GetDoctypeByCaption(oArchive.productid, msg.body.indexes[iIndex].value);
                    if (oRes.result) {
                        oArchive.doctypeid = oRes.response.id;
                        bTemp = true;
                    } else {
                        EIO.emitError(this, 'cannot find doctype: ' + msg.body.indexes[iIndex].value);
                    }
                    msg.body.indexes.splice(iIndex, 1);
                    break;
                }
            }
        }
        for (var iIndex = 0; iIndex < msg.body.indexes.length; iIndex++) {
            oArchive.indexvalues.push(msg.body.indexes[iIndex].id);
            oArchive.indexvalues.push(msg.body.indexes[iIndex].value);
        }
        if ((oArchive.productid >= 0) && (oArchive.clientid >= 0) && (oArchive.yearid >= 0) && (oArchive.doctypeid >= 0)) {
            try {
                var sURL = '';
                if (DMSAPI.TypeOf(msg.body.url, String)) {
                    sURL = msg.body.url;
                } else if (DMSAPI.TypeOf(msg.attachments, Object)) {
                    if (Object.keys(msg.attachments).length > 0) {
                        if (Object.keys(msg.attachments).length === 1) {
                            oArchive.filename = Object.keys(msg.attachments)[0];
                            sURL = msg.attachments[oArchive.filename].url;
                        } else {
                            EIO.emitError(this, 'multiple document-urls found.');
                        }
                    } else {
                        EIO.emitError(this, 'no document-url found.');
                    }
                } else {
                    EIO.emitError(this, 'no document-url found.');
                }
                if (sURL !== '') {
                    // const response = await rp({
                    //     method: 'GET',
                    //     encoding: null,
                    //     url: msg.body.url,
                    //     rejectUnauthorized: !DMSAPI.DEBUG,
                    //     resolveWithFullResponse: true
                    // });
                    const response = await DMSAPI.DoRequest(sURL, 'GET', undefined, undefined, null);
                    //DMSAPI.Log('GET resp: ' + JSON.stringify(response), 'debug');
                    if (oArchive.filename === '' && DMSAPI.TypeOf(response.headers['content-disposition'], String)) {
                        var oMatch = response.headers['content-disposition'].match(/(filename=\")(.+\..+)(\")/i);
                        if (DMSAPI.TypeOf(oMatch, Array) && (oMatch.length === 4)) {
                            sFilename = oMatch[2];
                        }
                    }
                    if (oArchive.filename === '') {
                        oArchive.filename = sURL.substring(sURL.lastIndexOf('/') + 1);
                    }
                    if ((oArchive.filename.lastIndexOf('.') === -1) && DMSAPI.TypeOf(response.headers['content-type'], String)) {
                        var sExt = mime.extension(response.headers['content-type']);
                        if (DMSAPI.TypeOf(sExt, String)) {
                            sExt = '.' + sExt;
                            DMSAPI.Log('"' + oArchive.filename + '" has no file extension, adding "' + sExt + '"', 'warning');
                            oArchive.filename = oArchive.filename + sExt;
                        } else {
                            EIO.emitError(this, '"' + oArchive.filename + '" has no file extension. unable to find extension for mime-type "' + response.headers['content-type'] + '".');
                            oArchive.filename = '';
                        }
                    }
                    if (oArchive.filename !== '') {
                        DMSAPI.Log('ARCHIVE ' + response.body.length + ' bytes ' + JSON.stringify(oArchive), 'debug');
                        const oRes = await oDMS.ArchiveDoc(oArchive, response.body);
                        if (oRes.result) {
                            DMSAPI.Log('archive ok', 'debug');
                            const oJSON = JSON.parse(oRes.response.body);
                            EIO.emitData(this, {
                                result: oRes.result,
                                message: oRes.message,
                                docID: oJSON.document.id
                            });
                        } else {
                            EIO.emitError(this, 'archive failed: ' + oRes.message);
                        }
                    } else {
                        EIO.emitError(this, 'unable to determine filename.');
                    }
                }
            } catch (ex) {
                EIO.emitError(this, (ex.statusCode + ' ' + ex.error + ' ' + ex.message).trim());
            }
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