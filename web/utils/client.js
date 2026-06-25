"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = void 0;
const thirdweb_1 = require("thirdweb");
exports.client = (0, thirdweb_1.createThirdwebClient)({
    clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ??
        "f136d41e31042d43ed46446aad3d79ff",
});
