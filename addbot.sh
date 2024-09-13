#!/usr/bin/env sh
echo "Open this link to add the bot to a Discord server:"
echo "https://discord.com/oauth2/authorize?client_id=$(grep discord_token registration.yaml | sed -E 's!.*: ["'\'']([A-Za-z0-9+=/_-]*).*!\1!g' | base64 -d)&scope=bot&permissions=1610883072"
