// @ts-check

const { AppServiceRegistration } = require("matrix-appservice");

let id = AppServiceRegistration.generateToken()
try {
	const reg = require("../matrix/read-registration")
	if (reg.id) id = reg.id
} catch (e) {}

// creating registration files
const newReg = new AppServiceRegistration(null);
newReg.setAppServiceUrl("http://localhost:6693");
newReg.setId(id);
newReg.setHomeserverToken(AppServiceRegistration.generateToken());
newReg.setAppServiceToken(AppServiceRegistration.generateToken());
newReg.setSenderLocalpart("_ooye_bot");
newReg.addRegexPattern("users", "@_ooye_.*", true);
newReg.addRegexPattern("aliases", "#_ooye_.*", true);
newReg.setProtocols(["discord"]); // For 3PID lookups
newReg.setRateLimited(false);
newReg.outputAsYaml("registration.yaml");
