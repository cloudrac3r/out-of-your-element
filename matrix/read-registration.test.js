const {test} = require("supertape")
const reg = require("./read-registration")

test("reg: has necessary parameters", t => {
   const propertiesToCheck = ["sender_localpart", "id", "as_token", "ooye"]
   t.deepEqual(
      propertiesToCheck.filter(p => p in reg),
      propertiesToCheck
   )
})
