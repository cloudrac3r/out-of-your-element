// @ts-check

const fs = require("fs")
const assert = require("assert").strict
const yaml = require("js-yaml")

/** @ts-ignore @type {import("../types").AppServiceRegistrationConfig} */
const reg = yaml.load(fs.readFileSync("registration.yaml", "utf8"))
assert(reg.ooye.max_file_size)
assert(reg.ooye.namespace_prefix)
assert(reg.ooye.server_name)
module.exports = reg
