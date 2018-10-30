'use strict';

const DEBUG = false;
var DEBUGLEVEL = 1;
if (DEBUG) {
    DEBUGLEVEL = 1;
};
const rp = require('request-promise-native');

/**
 * checks if a variable is of the expected type
 * @param {object} inVariable - variable to check the type of
 * @param {type} inType - type to be expected
 */
function TypeOf(inVariable, inType) {
    var result = ((typeof inVariable === 'undefined') && (inType === undefined));
    if ((!result) && (inType !== undefined)) {
        if ((inType === String) || (inType === Number) || (inType === Boolean)) {
            result = ((typeof inVariable).toLowerCase() === inType.name.toLowerCase());
        } else {
            // object, array, function, regexp
            result = (inVariable instanceof inType);
        }
        result = (result && (inVariable !== null));
    }
    return result;
}

/**
* log to console
* @param {string} inMessage - message to log
* @param {string} inType - "debug", "info", "warning", "error"
*/
async function Log(inMessage, inType, inDebugLevel = 1) {
    if ((inType !== 'debug') || (inDebugLevel <= DEBUGLEVEL)) {
        console.log(inType.toUpperCase(), inMessage);
    }
}

/**
* removes the trailing slash (/) of an URL
* @param {string} inURL - URL to request
*/
function TrimURL(inURL) {
    if (inURL.substring(inURL.length - 1) === '/') {
        return inURL.substring(0, inURL.length - 1);
    } else {
        return inURL;
    }
};

/**
* do a web request
* @param {string} inURL - URL to request
* @param {string} inMethod - request method to use, e.g. "GET" or "POST"
* @param {buffer} inBody - POST-data 
* @param {dictionary} inHeaders - dictionary containing custom headers
* @param {string} inEncoding - requested encoding
*/
async function DoRequest(inURL, inMethod, inBody = undefined, inHeaders = undefined, inEncoding = undefined) {
    Log(inMethod + ' ' + inURL, 'debug', 2);
    try {
        const response = await rp({
            method: inMethod,
            url: inURL,
            encoding: inEncoding,
            body: inBody,
            headers: inHeaders,
            rejectUnauthorized: !DEBUG,
            resolveWithFullResponse: true
        });
        Log(response.body, 'debug', 2);
        return response;
    } catch (ex) {
        Log((ex.statusCode + ' ' + ex.error).trim(), 'error');
        return ex;
    }
};

module.exports = function DMSAPI(snapshot) {
    this.foData = snapshot || {};
    this.foData.url = this.foData.url || '';
    this.foData.user = this.foData.user || '';
    this.foData.sessionid = this.foData.sessionid || '';
    this.foData.products = this.foData.products || [];

    /**
    * login
    * automatically checks for valid session-id in snapshot, does login if necessary
    * @param {string} inURL - URL of the Starke-DMS webserver, e.g. https://dms.example.com:27247/
    * @param {string} inUser - user account name to be used
    * @param {string} inPassword - password of account
    */
    this.Login = async function Login(inURL, inUser, inPassword) {
        const result = { result: false, message: '', response: null };
        var sURL = inURL;
        if (sURL.substring(sURL.length - 1) === '/') {
            sURL = sURL.substring(0, sURL.length - 1);
        }
        if (this.foData.sessionid !== '') {
            // check old sessionid
            result.response = await DoRequest(inURL + '/user/login:nometa/?sessionid=' + encodeURIComponent(this.foData.sessionid), 'GET');
            if (result.response.statusCode === 200) {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
                if (oJSON.response.code === 200) {
                    result.result = true;
                } else {
                    this.foData.sessionid = '';
                }
            } else {
                this.foData.sessionid = '';
            }
        }
        if (this.foData.sessionid === '') {
            // new login
            const sAuth = Buffer.from(JSON.stringify({
                username: inUser,
                password: inPassword,
                modulename: 'Elastic.IO'
            })).toString('base64');
            result.response = await DoRequest(inURL + '/user/login:nometa:base64/', 'POST', sAuth, { 'content-type': 'application/x-www-form-urlencoded' });
        }
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                if ((this.foData.url !== inURL) || (this.foData.user !== inUser) || (this.foData.sessionid === '')) {
                    this.foData.products = [];
                }
                this.foData.url = inURL;
                this.foData.user = inUser;
                this.foData.sessionid = oJSON.user[0].sessionid;
                if (this.foData.products.length === 0) {
                    Log('refreshing snapshot data', 'debug')
                    const oRes = await this.Init();
                    if (oRes.response.statusCode === 200) {
                        const oJSON = JSON.parse(oRes.response.body);
                        oRes.message = oJSON.response.message;
                        if (oJSON.response.code === 200) {
                            result.result = true;
                        }
                    }
                } else {
                    Log('using snapshot data', 'debug');
                    result.result = true;
                }
                if (!result.result) {
                    // init failed
                    await this.Logout();
                }
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * logout
    */
    this.Logout = async function Logout() {
        const result = { result: false, message: '', response: null };
        result.response = await DoRequest(this.foData.url + '/user/logout/?sessionid=' + encodeURIComponent(this.foData.sessionid), 'GET');
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            if (oJSON.response.code === 200) {
                this.foData.url = '';
                this.foData.user = '';
                this.foData.sessionid = '';
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * initializes dictionaries with ids of products, clients, businessyears and doctypes
    */
    this.Init = async function Init() {
        const result = { result: false, message: '', response: null };
        // if (this.foData.products.length > 0) {
        //     if (this.foData.products[0].clients.length > 0) {
        //         if (this.foData.products[0].clients[0].years.length > 0) {
        //             if (this.foData.products.doctypes.length > 0) {
        //                 result.result = true;
        //             }
        //         }
        //     }
        // }
        // if (!result.result) {
        const oRes = await this.GetProducts();
        if (oRes.result) {
            const oRes = await this.GetClients();
            if (oRes.result) {
                const oRes = await this.GetYears();
                if (oRes.result) {
                    result.result = true;
                    result.message = oRes.message;
                    result.response = oRes.response;
                } else {
                    result.message = oRes.message;
                    result.response = oRes.response;
                }
            } else {
                result.message = oRes.message;
                result.response = oRes.response;
            }
            if (result.result) {
                const oRes = await this.GetDoctypes();
                if (oRes.result) {
                    result.result = true;
                    result.message = oRes.message;
                    result.response = oRes.response;
                } else {
                    result.message = oRes.message;
                    result.response = oRes.response;
                }
            }
        } else {
            result.message = oRes.message;
            result.response = oRes.response;
        }
        // }
        return result;
    }

    /**
    * requests list of products the user has access to. stores products in dictionary.
    */
    this.GetProducts = async function GetProducts() {
        const result = { result: false, message: '', response: null };
        result.response = await DoRequest(this.foData.url + '/product/list/?sessionid=' + encodeURIComponent(this.foData.sessionid), 'GET');
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                this.foData.products = [];
                for (var iProduct = 0; iProduct < oJSON.product.length; iProduct++) {
                    var oProduct = oJSON.product[iProduct];
                    const oTemp = {
                        'id': oProduct.id,
                        'name': oProduct.name,
                        'doctypes': [],
                        'clients': []
                    };
                    this.foData.products.push(oTemp);
                }
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * requests list of clients the user has access to. stores clients in dictionary.
    */
    this.GetClients = async function GetClients() {
        const result = { result: false, message: '', response: null };
        result.response = await DoRequest(this.foData.url + '/client/list/?sessionid=' + encodeURIComponent(this.foData.sessionid), 'GET');
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                for (var iProduct = 0; iProduct < this.foData.products.length; iProduct++) {
                    var oProduct = this.foData.products[iProduct];
                    oProduct.clients = [];
                    for (var iClient = 0; iClient < oJSON.client.length; iClient++) {
                        var oClient = oJSON.client[iClient];
                        if (oClient.productid === oProduct.id) {
                            const oTemp = {
                                'id': oClient.id,
                                'name': oClient.name,
                                'caption': oClient.caption,
                                'years': []
                            };
                            oProduct.clients.push(oTemp);
                        }
                    }
                }
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * requests list of businessyears the user has access to. stores years in dictionary.
    */
    this.GetYears = async function GetYears() {
        const result = { result: false, message: '', response: null };
        result.response = await DoRequest(this.foData.url + '/year/list/?sessionid=' + encodeURIComponent(this.foData.sessionid), 'GET');
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                for (var iProduct = 0; iProduct < this.foData.products.length; iProduct++) {
                    var oProduct = this.foData.products[iProduct];
                    for (var iClient = 0; iClient < oProduct.clients.length; iClient++) {
                        var oClient = oProduct.clients[iClient];
                        oClient.years = [];
                        for (var iYear = 0; iYear < oJSON.year.length; iYear++) {
                            var oYear = oJSON.year[iYear];
                            if ((oYear.productid === oProduct.id) && (oYear.clientid === oClient.id)) {
                                const oTemp = {
                                    'id': oYear.id,
                                    // 'caption': oYear.caption,
                                    // 'readonly': oYear.readonly,
                                    'startdate': oYear.startdate,
                                    'enddate': oYear.enddate
                                };
                                oClient.years.push(oTemp);
                            }
                        }
                    }
                }
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * requests list of document-types the user has access to. stores types in dictionary.
    */
    this.GetDoctypes = async function GetDoctypes() {
        const result = { result: false, message: '', response: null };
        result.response = await DoRequest(this.foData.url + '/doctype/list/?sessionid=' + encodeURIComponent(this.foData.sessionid), 'GET');
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                for (var iProduct = 0; iProduct < this.foData.products.length; iProduct++) {
                    var oProduct = this.foData.products[iProduct];
                    oProduct.doctypes = [];
                    for (var iDoctype = 0; iDoctype < oJSON.doctype.length; iDoctype++) {
                        var oDoctype = oJSON.doctype[iDoctype];
                        if (oDoctype.productid === oProduct.id) {
                            const oTemp = {
                                'id': oDoctype.id,
                                'caption': oDoctype.caption
                            };
                            oProduct.doctypes.push(oTemp);
                        }
                    }
                }
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * returns product-dictionary which matches the name provided.
    * @param {string} inProductName - name of the product to find, e.g. "DMS"
    */
    this.GetProductByName = async function GetProductByName(inProductName) {
        const result = { result: false, message: '', response: null };
        for (var iProduct = 0; iProduct < this.foData.products.length; iProduct++) {
            var oProduct = this.foData.products[iProduct];
            if (oProduct.name.toUpperCase() === inProductName.toUpperCase()) {
                result.result = true;
                result.response = oProduct;
                break;
            }
        }
        Log('GetProductByName "' + inProductName + '": ' + JSON.stringify(result.response), 'debug', 2);
        return result;
    }

    /**
    * returns client-dictionary which matches the name provided.
    * @param {integer} inProductID - id of the product which should contain the client, e.g. 0
    * @param {string} inClientName - name of the client to find, e.g. "0001"
    */
    this.GetClientByName = async function GetProductByName(inProductID, inClientName) {
        const result = { result: false, message: '', response: null };
        for (var iProduct = 0; iProduct < this.foData.products.length; iProduct++) {
            var oProduct = this.foData.products[iProduct];
            if (oProduct.id === inProductID) {
                for (var iClient = 0; iClient < oProduct.clients.length; iClient++) {
                    var oClient = oProduct.clients[iClient];
                    if (oClient.name.toUpperCase() === inClientName.toUpperCase()) {
                        result.result = true;
                        result.response = oClient;
                        break;
                    }
                }
            }
        }
        Log('GetClientByName "' + inProductID + '", "' + inClientName + '": ' + JSON.stringify(result.response), 'debug', 2);
        return result;
    }

    /**
    * returns year-dictionary which contains the date provided. date must be in format DD.MM.YYYY.
    * @param {integer} inProductID - id of the product which should contain the client, e.g. 0
    * @param {integer} inClientID - id of the client which should contain the year, e.g. 1
    * @param {string} inDate - date to find a year for, e.g. 31.12.2017
    */
    this.GetYearByDate = async function GetClientByCaption(inProductID, inClientID, inDate) {
        const result = { result: false, message: '', response: null };
        var sDate = '';
        var oMatches = inDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        // console.log(oMatches);
        if (oMatches !== null) {
            sDate = oMatches[3] + '-' + oMatches[2] + '-' + oMatches[1] + 'T00:00:00Z';
        } else {
            oMatches = inDate.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
            // console.log(oMatches);
            if (oMatches !== null) {
                sDate = oMatches[3] + '-' + oMatches[2] + '-' + oMatches[1] + 'T' + oMatches[4] + ':' + oMatches[5] + ':' + oMatches[6] + 'Z';
            }
        }
        if (sDate !== '') {
            const oDate = new Date(sDate);
            for (var iProduct = 0; iProduct < this.foData.products.length; iProduct++) {
                var oProduct = this.foData.products[iProduct];
                if (oProduct.id === inProductID) {
                    for (var iClient = 0; iClient < oProduct.clients.length; iClient++) {
                        var oClient = oProduct.clients[iClient];
                        if (oClient.id === inClientID) {
                            for (var iYear = 0; iYear < oClient.years.length; iYear++) {
                                var oYear = oClient.years[iYear];
                                var oStartDate = undefined;
                                var oEndDate = undefined;
                                oMatches = oYear.startdate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
                                // console.log(oMatches);
                                if (oMatches !== null) {
                                    const sDate = oMatches[3] + '-' + oMatches[2] + '-' + oMatches[1] + 'T00:00:00Z';
                                    oStartDate = new Date(sDate);
                                }
                                oMatches = oYear.enddate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
                                // console.log(oMatches);
                                if (oMatches !== null) {
                                    const sDate = oMatches[3] + '-' + oMatches[2] + '-' + oMatches[1] + 'T00:00:00Z';
                                    oEndDate = new Date(sDate);
                                }
                                if ((oStartDate !== undefined) && (oEndDate !== undefined) && (oDate >= oStartDate) && (oDate <= oEndDate)) {
                                    result.result = true;
                                    result.response = oYear;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        } else {
            result.message = 'unknown dateformat "' + inDate + '"';
        }
        Log('GetClientByName "' + inProductID + '", "' + inClientID + '", "' + inDate + '": ' + JSON.stringify(result.response), 'debug', 2);
        return result;
    }

    /**
    * returns document-type-dictionary which matches the caption provided.
    * @param {integer} inProductID - id of the product which should contain the document-type, e.g. 0
    * @param {string} inDoctypeCaption - caption of the document-type to find, e.g. "Ausgangsrechnungen"
    */
    this.GetDoctypeByCaption = async function GetDoctypeByCaption(inProductID, inDoctypeCaption) {
        const result = { result: false, message: '', response: null };
        for (var iProduct = 0; iProduct < this.foData.products.length; iProduct++) {
            var oProduct = this.foData.products[iProduct];
            if (oProduct.id === inProductID) {
                for (var iDoctype = 0; iDoctype < oProduct.doctypes.length; iDoctype++) {
                    var oDoctype = oProduct.doctypes[iDoctype];
                    if (oDoctype.caption.toUpperCase() === inDoctypeCaption.toUpperCase()) {
                        result.result = true;
                        result.response = oDoctype;
                        break;
                    }
                }
            }
        }
        Log('GetClientByName "' + inProductID + '", "' + inDoctypeCaption + '": ' + JSON.stringify(result.response), 'debug', 2);
        return result;
    }

    /**
    * archives a document.
    * @param {dictionary} inJSON - dictionary containing the information necessary for archiving, i.e. product-id, client-id, ...
    * @param {buffer} inBuffer - buffer containing the actual document-data to be archived
    */
    this.ArchiveDoc = async function ArchiveDoc(inJSON, inBuffer) {
        const result = { result: false, message: '', response: null };
        result.response = await DoRequest(this.foData.url + '/document/set/?' + encodeURIComponent(JSON.stringify(inJSON)) + '&sessionid=' + encodeURIComponent(this.foData.sessionid), 'POST', inBuffer);
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * search for documents
    * @param {dictionary} inSearchParams - dictionary containing the information necessary for the search
    */
    this.Search = async function Search(inJSON) {
        const result = { result: false, message: '', response: null };
        const sData = JSON.stringify(inJSON);
        Log('search: ' + sData, 'debug');
        result.response = await DoRequest(this.foData.url + '/search/?sessionid=' + encodeURIComponent(this.foData.sessionid), 'POST', sData, { 'content-type': 'application/json' });
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * retrieve documents found using Search()
    * @param {integer} inStartPos - position from where to start retrieving
    * @param {integer} inCount - number of search-results to retrieve
    */
    this.SearchGet = async function SearchGet(inStartPos, inCount) {
        const result = { result: false, message: '', response: null };
        const sData = JSON.stringify({
            startpos: inStartPos,
            count: inCount
        });
        Log('searchresult: ' + sData, 'debug');
        result.response = await DoRequest(this.foData.url + '/searchresult/?sessionid=' + encodeURIComponent(this.foData.sessionid), 'POST', sData, { 'content-type': 'application/json' });
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * retrieve document index values
    * @param {integer} inDocID - document id (index 0)
    */
    this.DocInfo = async function DocInfo(inDocID) {
        const result = { result: false, message: '', response: null };
        Log('docinfo: ' + inDocID, 'debug');
        result.response = await DoRequest(this.foData.url + '/document/' + encodeURIComponent(inDocID) + '/info:indexes?sessionid=' + encodeURIComponent(this.foData.sessionid));
        if (result.response.statusCode === 200) {
            const oJSON = JSON.parse(result.response.body);
            result.message = oJSON.response.message;
            if (oJSON.response.code === 200) {
                result.result = true;
            }
        } else {
            try {
                const oJSON = JSON.parse(result.response.body);
                result.message = oJSON.response.message;
            } catch (error) {
                result.message = error.message;
            }
        }
        return result;
    }

    /**
    * retrieve the original document file
    * @param {integer} inDocID - document id (index 0)
    */
    this.DocFile = async function DocFile(inDocID) {
        const result = { result: false, message: '', response: null };
        Log('docfile: ' + inDocID, 'debug');
        //await DoRequest(this.foData.url + '/document/' + encodeURIComponent(inDocID) + '/file?sessionid=' + encodeURIComponent(this.foData.sessionid));
        try {
            result.response = await rp({
                method: 'GET',
                encoding: null,
                url: this.foData.url + '/document/' + encodeURIComponent(inDocID) + '/file?sessionid=' + encodeURIComponent(this.foData.sessionid),
                rejectUnauthorized: !DEBUG,
                resolveWithFullResponse: true
            });
            if (result.response.statusCode === 200) {
                Log('filesize: ' + result.response.body.length, 'debug');
                result.message = 'OK';
                result.result = true;
            } else {
                try {
                    const oJSON = JSON.parse(result.response.error);
                    result.message = oJSON.response.message;
                } catch (error) {
                    result.message = error.message;
                }
            }
        } catch (ex) {
            result.message = (ex.statusCode + ' ' + ex.error + ' ' + ex.message).trim();
        }
        return result;
    }

    return this;
};
module.exports.DEBUG = DEBUG;
module.exports.TypeOf = TypeOf;
module.exports.Log = Log;
module.exports.TrimURL = TrimURL;
module.exports.DoRequest = DoRequest;