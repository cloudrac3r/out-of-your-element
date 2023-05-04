// @ts-check

const fs = require("fs")
const yaml = require("js-yaml")

/** @type {import("../types").AppServiceRegistrationConfig} */
module.exports = yaml.load(fs.readFileSync("registration.yaml", "utf8"))
