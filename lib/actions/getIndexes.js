'use strict';

const DMSAPI = require('../dmsapi.js');
const EIO = require('../eio-tools.js');
const rp = require('request-promise-native');

async function processAction(msg, cfg, snapshot) {
    const oDMS = new DMSAPI(snapshot);
    const oRes = await oDMS.Login(DMSAPI.TrimURL(cfg.dms_url) + '/dms', cfg.dms_user, cfg.dms_pass);
    if (oRes.result) {
        const oSearch = {
            indexes: [{
                id: 0,
                operator: '=',
                value: msg.body.docID
            }]
        };
        const oRes = await oDMS.Search(oSearch);
        if (oRes.result) {
            DMSAPI.Log('search ok', 'debug');
            const oRes = await oDMS.SearchGet(0, 1);
            if (oRes.result) {
                const oJSON = JSON.parse(oRes.response.body);
                DMSAPI.Log('results: ' + oJSON.searchresult.maxcountdocument, 'debug');
                if (oJSON.searchresult.maxcountdocument > 0) {
                    const oInfo = await oDMS.DocInfo(oJSON.searchresult.document[0].id);
                    if (oInfo.result) {
                        const oDoc = JSON.parse(oInfo.response.body);
                        //DMSAPI.Log('docinfo: ' + JSON.stringify(oDoc), 'debug');
                        EIO.emitData(this, {
                            result: oInfo.result,
                            message: oInfo.message,
                            indexes: oDoc.document.index
                        });
                    } else {
                        EIO.emitError(this, 'docinfo failed: ' + oRes.message);
                    }
                } else {
                    EIO.emitError(this, 'document not found');
                }
            } else {
                EIO.emitError(this, 'searchget failed: ' + oRes.message);
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