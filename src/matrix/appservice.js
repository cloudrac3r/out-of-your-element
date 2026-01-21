// @ts-check

const {reg} = require("../matrix/read-registration")
const {AppService} = require("@cloudrac3r/in-your-element")
const as = new AppService(reg)

module.exports.as = as
