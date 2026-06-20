#!/usr/bin/env bash
set -euo pipefail

cp -r /home/itadmin/webapp/.next/standalone/webapp /home/itadmin/webapp-prd/.next/standalone
cp -r /home/itadmin/webapp/.next/static /home/itadmin/webapp-prd/.next/standalone/.next
cp -r /home/itadmin/webapp/public /home/itadmin/webapp-prd/.next/standalone/public
cp -r /home/itadmin/webapp/.next/standalone/.nvm /home/itadmin/webapp-prd/.next/standalone
