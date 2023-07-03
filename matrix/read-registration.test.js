const {test} = require("supertape")
const reg = require("./read-registration")

test("reg: has necessary parameters", t => {
   const propertiesToCheck = ["sender_localpart", "id", "as_token", "namespace_prefix"]
   t.deepEqual(
      propertiesToCheck.filter(p => p in reg),
      propertiesToCheck
   )
})
