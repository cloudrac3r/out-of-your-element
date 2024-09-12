// @ts-check

const {reg} = require("../matrix/read-registration")
const {AppService} = require("@cloudrac3r/in-your-element")
const as = new AppService(reg)
as.listen()

module.exports.as = as
