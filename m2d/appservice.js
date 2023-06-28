const reg = require("../matrix/read-registration")
const AppService = require("matrix-appservice").AppService
const as = new AppService({
	homeserverToken: reg.hs_token
})
as.listen(+(new URL(reg.url).port))

module.exports = as
