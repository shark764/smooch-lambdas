const { ValidationError } = require('joi');
const {
  lambda: {
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');

jest.mock('aws-sdk');
jest.mock('alonzo');

validateTenantPermissions.mockReturnValue(true);
validatePlatformPermissions.mockReturnValue(false);

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

const mockQuery = jest.fn().mockImplementation(() => ({
  promise: () => ({
    Count: 1,
    Items: [
      {
        created: '2020-11-10T19:56:39.673Z',
        'client-disconnect-minutes': 5,
        'updated-by': 'b47027e0-1126-11ea-953d-9bdc6d6573af',
        'app-id': '5fa425ef26770c000c171f9c',
        name: 'My test whatsapp integration',
        'created-by': 'b47027e0-1126-11ea-953d-9bdc6d6573af',
        type: 'whatsapp',
        updated: '2020-11-10T19:56:39.673Z',
        description: 'This is a test',
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
        id: '5e31c81640a22c000f5d7f28',
        active: true,
      },
    ],
  }),
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({ query: mockQuery })),
  },
}));

const { handler } = require('../index');

describe('get-whatsapp-integrations', () => {
  describe('Everything is successful', () => {
    it('sends back status 200 if the code runs without error ', async () => {
      const result = await handler(event);
      expect(result).toEqual({
        body: {
          result: [
            {
              active: true,
              appId: '5fa425ef26770c000c171f9c',
              clientDisconnectMinutes: 5,
              created: '2020-11-10T19:56:39.673Z',
              createdBy: 'b47027e0-1126-11ea-953d-9bdc6d6573af',
              description: 'This is a test',
              id: '5e31c81640a22c000f5d7f28',
              name: 'My test whatsapp integration',
              tenantId: '66d83870-30df-4a3b-8801-59edff162034',
              type: 'whatsapp',
              updated: '2020-11-10T19:56:39.673Z',
              updatedBy: 'b47027e0-1126-11ea-953d-9bdc6d6573af',
            },
          ],
        },
        status: 200,
      });
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        await handler(event);
      });
      it('passes in the correct arguments to validateTenantPermissions', async () => {
        expect(validateTenantPermissions.mock.calls).toEqual(
          expect.arrayContaining([
            [
              '66d83870-30df-4a3b-8801-59edff162034',
              { 'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0' },
              ['WHATSAPP_INTEGRATIONS_APP_READ'],
            ],
            [
              '66d83870-30df-4a3b-8801-59edff162034',
              { 'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0' },
              ['WHATSAPP_INTEGRATIONS_APP_READ'],
            ],
          ]),
        );
      });
      it('passes in the correct arguments to validatePlatformPermissions', async () => {
        expect(validatePlatformPermissions.mock.calls).toEqual([
          [
            { 'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0' },
            ['PLATFORM_VIEW_ALL'],
          ],
          [
            { 'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0' },
            ['PLATFORM_VIEW_ALL'],
          ],
        ]);
      });
      it('passes in the correct arguments to docClient.query()', async () => {
        expect(mockQuery.mock.calls[0]).toEqual([
          {
            ExpressionAttributeNames: {
              '#integrationType': 'type',
              '#tenantId': 'tenant-id',
            },
            ExpressionAttributeValues: {
              ':t': '66d83870-30df-4a3b-8801-59edff162034',
              ':type': 'whatsapp',
            },
            IndexName: 'tenant-id-type-index',
            KeyConditionExpression:
              '#tenantId = :t and #integrationType = :type',
            TableName: 'us-east-1-dev-smooch',
          },
        ]);
      });
    });
  });

  it('sends back status 400 when there are invalid params value', async () => {
    const mockEvent = {
      params: {
        'tenant-id': '',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        error: new ValidationError('"tenant-id" is not allowed to be empty'),
        message:
          'Error: invalid params value(s). "tenant-id" is not allowed to be empty',
      },
      status: 400,
    });
  });

  it('sends back status 403 when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        expectedPermissions: {
          tenant: ['WHATSAPP_INTEGRATIONS_APP_READ'],
          platform: ['PLATFORM_VIEW_ALL'],
        },
        message: 'Error not enough permissions',
      },
      status: 403,
    });
  });

  it('sends back status 500 when there is a problem fetching apps in DynamoDB', async () => {
    mockQuery.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message:
          'An Error has occurred trying to fetch integrations in DynamoDB',
        queryParams: {
          ExpressionAttributeNames: {
            '#integrationType': 'type',
            '#tenantId': 'tenant-id',
          },
          ExpressionAttributeValues: {
            ':t': '66d83870-30df-4a3b-8801-59edff162034',
            ':type': 'whatsapp',
          },
          IndexName: 'tenant-id-type-index',
          KeyConditionExpression: '#tenantId = :t and #integrationType = :type',
          TableName: 'us-east-1-dev-smooch',
        },
      },
      status: 500,
    });
  });
});
