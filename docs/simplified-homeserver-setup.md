# Simplified Homeserver Setup

Full instructions are located around here: https://matrix-org.github.io/synapse/v1.37/setup/installation.html

These instructions are for a quick setup you can use for local development of OOYE, if you don't have administrator access to an existing homeserver.

## Windows prerequisites

Enter an Ubuntu WSL. LOL

## Install Synapse

We'll install from the prebuilt packages provided by matrix.org. If you're not on Debian/Ubuntu then you can find more package names [in the official docs.](https://matrix-org.github.io/synapse/v1.37/setup/installation.html#prebuilt-packages)

```
sudo apt install -y lsb-release wget apt-transport-https
sudo wget -O /usr/share/keyrings/matrix-org-archive-keyring.gpg https://packages.matrix.org/debian/matrix-org-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/matrix-org-archive-keyring.gpg] https://packages.matrix.org/debian/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/matrix-org.list
sudo apt update
sudo apt install matrix-synapse-py3
```

After the final command finishes downloading, it will interactively prompt you for the homeserver's name for federation. Just enter `localhost`.
If you want to change this later, you can do so with `sudo dpkg-reconfigure matrix-synapse-py3`.

## Not installing additional features

We're going to stick with SQLite, which isn't as efficient as Postgres, but significantly eases setup. For this small test, SQLite should do just fine.

We don't need TLS certificates for localhost.

## Start it on Linux

```
sudo systemctl start matrix-synapse
```

## Start it on Windows

Trying to start it with systemctl doesn't seem to like me, so I'll do it this way:

```
sudo /opt/venvs/matrix-synapse/bin/python -m synapse.app.homeserver --config-path=/etc/matrix-synapse/homeserver.yaml --config-path=/etc/matrix-synapse/conf.d/ --generate-keys
sudo /opt/venvs/matrix-synapse/bin/python -m synapse.app.homeserver --config-path=/etc/matrix-synapse/homeserver.yaml --config-path=/etc/matrix-synapse/conf.d/
```

## Notes

If you see `Config is missing macaroon_secret_key`, you can ignore this. The real log messages are in `/var/log/matrix-synapse/*.log`.
