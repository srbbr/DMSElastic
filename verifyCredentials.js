const DMSAPI = require('./lib/dmsapi.js');

async function verify(cfg, cb) {
    console.log('about to verify credentials');
    const oDMS = new DMSAPI();
    const oRes = await oDMS.Login(DMSAPI.TrimURL(cfg.dms_url) + '/dms', cfg.dms_user, cfg.dms_pass);
    if (oRes.result) {
        await oDMS.Logout();
        console.log('verification successful');
        cb(null, { verified: true });
    } else {
        console.log('verification failed: ' + oRes.message);
        cb(new Error(oRes.message), { verified: false });
    }
};

module.exports = verify;
