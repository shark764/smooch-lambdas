/* eslint-disable no-console */

const AWS = require('aws-sdk');
// const axios = require('axios');

AWS.config.update({ region: 'us-east-1' });

const dynamodb = new AWS.DynamoDB();

const SMOOCH_TABLE = 'us-east-1-dev-smooch';
// const CX_URL = 'https://dev-api.cxengagelabs.net';
// const CX_CREDENTIALS = {
//   username: 'jclowater@serenova.com',
//   password: '********',
// };

(async () => {
  const items = await dynamodb.scan({
    TableName: SMOOCH_TABLE,
  }).promise();
  // console.log('items', items.Items);

  const tenantAppsMap = [];
  let totalNumberOfApps = 0;
  for (const item of items.Items) {
    // console.log('item', item);

    const tenantId = item['tenant-id'].S;
    const type = item.type.S;
    const tenantMapItemIndex = tenantAppsMap.findIndex(
      (tenantApp) => tenantApp.tenantId === tenantId,
    );

    if (tenantMapItemIndex === -1) {
      if (type === 'app') {
        tenantAppsMap.push({
          tenantId,
          apps: [{
            name: item.name.S,
            id: item.id.S,
            integrations: [],
          }],
        });
        totalNumberOfApps += 1;
      } else {
        tenantAppsMap.push({
          tenantId,
          apps: [{
            id: item['app-id'].S,
            integrations: [{
              name: item.name.S,
              id: item.id.S,
            }],
          }],
        });
      }
    } else if (type === 'app') {
      const appIndex = tenantAppsMap[tenantMapItemIndex].apps.findIndex(
        (app) => app.id === item.id.S,
      );
      if (appIndex === -1) {
        tenantAppsMap[tenantMapItemIndex].apps.push({
          name: item.name.S,
          id: item.id.S,
          integrations: [],
        });
      } else {
        const updatedApp = {
          ...tenantAppsMap[tenantMapItemIndex].apps[appIndex],
          name: item.name.S,
        };
        tenantAppsMap[tenantMapItemIndex].apps[appIndex] = updatedApp;
      }
      totalNumberOfApps += 1;
    } else {
      const appIndex = tenantAppsMap[tenantMapItemIndex].apps.findIndex(
        (app) => app.id === item['app-id'].S,
      );
      if (appIndex === -1) {
        tenantAppsMap[tenantMapItemIndex].apps.push({
          id: item['app-id'].S,
          integrations: [{
            name: item.name.S,
            id: item.id.S,
          }],
        });
      } else {
        tenantAppsMap[tenantMapItemIndex].apps[appIndex].integrations.push(
          {
            name: item.name.S,
            id: item.id.S,
          },
        );
      }
    }
  }

  console.log('Total number of apps:', totalNumberOfApps);

  /**
    * Uncomment out below (and above dependencies/constants) to get a
    * pretty-printed list of all tenants and their apps and integrations.
    */
  // for (const tenantApp of tenantAppsMap) {
  //   const tenant = await axios.get(
  //     `${CX_URL}/v1/tenants/${tenantApp.tenantId}`,
  //     { auth: CX_CREDENTIALS },
  //   );
  //   console.log(tenant.data.result.name, '-', tenantApp.tenantId);
  //   for (const app of tenantApp.apps) {
  //     console.log('  -', app.name, '-', app.id);
  //     for (const integration of app.integrations) {
  //       console.log('    -', integration.name, '-', integration.id);
  //     }
  //   }
  // }
})().catch((e) => {
  console.error('Unexpected error', e);
});
