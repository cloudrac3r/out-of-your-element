# Setup

If you get stuck, you're welcome to message [#out-of-your-element:cadence.moe](https://matrix.to/#/#out-of-your-element:cadence.moe) or [@cadence:cadence.moe](https://matrix.to/#/@cadence:cadence.moe) to ask for help setting up OOYE!

You'll need:

* Administrative access to a homeserver
* Discord bot
* Domain name for the bridge's website - [more info](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/why-does-the-bridge-have-a-website.md)
* Reverse proxy for that domain - an interactive process will help you set this up in step 5!

Follow these steps:

1. [Get Node.js version 22 or later](https://nodejs.org/en/download/prebuilt-installer). If you're on Linux, you may prefer to install through system's package manager, though Debian and Ubuntu have hopelessly out of date packages.

1. Switch to a normal user account. (i.e. do not run any of the following commands as root or sudo.)

1. Clone this repo and checkout a specific tag. (Development happens on main. Stable versions are tagged.)
	* The latest release tag is ![](https://img.shields.io/gitea/v/release/cadence/out-of-your-element?gitea_url=https%3A%2F%2Fgitdab.com&style=flat-square&label=%20&color=black).

1. Install dependencies: `npm install`

1. Run `npm run setup` to check your setup and set the bot's initial state. You only need to run this once ever. This command will guide you precisely through the following steps:

	* First, you'll be asked for information like your homeserver URL.

	* Then you'll be prompted to set up a reverse proxy pointing from your domain to the bridge's web server. Sample configurations can be found at the end of this guide. It will check that the reverse proxy works before you continue.

	* Then you'll need to provide information about your Discord bot, and you'll be asked to change some of its settings.

	* Finally, a registration.yaml file will be generated, which you need to give to your homeserver. You'll be told how to do this. It will check that it's done properly.

1. Start the bridge: `npm run start`

## Update

New versions are announced in [#updates](https://matrix.to/#/#ooye-updates:cadence.moe) and listed on [releases](https://gitdab.com/cadence/out-of-your-element/releases). Here's how to update:

1. Fetch the repo and checkout the latest release tag.

1. Install dependencies: `npm install`

1. Restart the bridge: Stop the currently running process, and then start the new one with `npm run start`

# Get Started

Visit the website on the domain name you set up, and click the button to add the bot to your Discord server.

* If you click the Easy Mode button, it will automatically create a Matrix room corresponding to each Discord channel. This happens next time a message is sent on Discord (so that your Matrix-side isn't immediately cluttered with lots of inactive rooms).

* If you click the Self Service button, it won't create anything for you. You'll have to provide your own Matrix space and rooms. After you click, you'll be prompted through the process. Use this if you're migrating from another bridge!

After that, to get into the rooms on your Matrix account, use the invite form on the website, or the `/invite [your mxid here]` command on Discord.

I hope you enjoy Out Of Your Element!

----
<br><br><br><br><br>

# Appendix

## Example reverse proxy for nginx, dedicated domain name

Replace `bridge.cadence.moe` with the hostname you're using.

```nix
server {
	listen 80;
	listen [::]:80;
	server_name bridge.cadence.moe;

	return 301 https://bridge.cadence.moe$request_uri;
}

server {
	listen 443 ssl http2;
	listen [::]:443 ssl http2;
	server_name bridge.cadence.moe;

	# ssl parameters here...
	client_max_body_size 5M;

	location / {
		add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
		proxy_pass http://127.0.0.1:6693;
	}
}
```

## Example reverse proxy for nginx, sharing a domain name

Same as above, but change the following:

- `location / {` -> `location /ooye/ {` (any sub-path you want; you MUST use a trailing slash or it won't work)
- `proxy_pass http://127.0.0.1:6693;` -> `proxy_pass http://127.0.0.1:6693/;` (you MUST use a trailing slash on this too or it won't work)

## Example reverse proxy for Caddy, dedicated domain name

```nix
bridge.cadence.moe {
	log {
		output file /var/log/caddy/access.log
		format console
	}
	encode gzip
	reverse_proxy 127.0.0.1:6693
}
```
