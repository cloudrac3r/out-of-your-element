// @ts-check

const fs = require("fs")
const yaml = require("js-yaml")

/** @ts-ignore @type {import("../types").AppServiceRegistrationConfig} */
const reg = yaml.load(fs.readFileSync("registration.yaml", "utf8"))
module.exports = reg