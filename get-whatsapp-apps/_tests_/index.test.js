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
const mockGetSecretValue = jest.fn().mockImplementation(() => ({
  promise: () => ({
    SecretString: JSON.stringify({
      '5e31c81640a22c000f5d7f28-id': 'id',
      '5e31c81640a22c000f5d7f28-secret': 'secret',
    }),
  }),
}));

const mockQuery = jest.fn().mockImplementation(() => ({
  promise: () => ({
    Count: 1,
    Items: [
      {
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
        id: '5e31c81640a22c000f5d7f28',
      },
    ],
  }),
}));

const mockList = jest.fn().mockImplementation(() => ({
  integrations: [
    {
      _id: '5e31c81640a22c000f5d7f2c',
      type: 'whatsapp',
      status: 'active',
      sandbox: true,
      displayName: 'WhatsApp Sandbox',
      phoneNumber: '+1 (438) 476-3261',
      sandboxExternalId: '50371675753',
    },
    {
      _id: '5e31c81640a22c000f5d7f2n',
      type: 'whatsapp',
      status: 'inactive',
      sandboxConfirmationCode: 'grande anil',
      phoneNumber: '+1 (438) 476-3261',
    },
  ],
  hasMore: false,
  offset: 0,
}));

const mockSmoochCore = jest.fn(() => ({
  integrations: {
    list: mockList,
  },
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest
    .fn()
    .mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({ query: mockQuery })),
  },
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('get-whatsapp-apps', () => {
  describe('Everything is successful', () => {
    it('sends back status 200 if the code runs without error ', async () => {
      const result = await handler(event);
      expect(result).toEqual({
        body: {
          result: [
            {
              appId: '5e31c81640a22c000f5d7f28',
              displayName: 'WhatsApp Sandbox',
              id: '5e31c81640a22c000f5d7f2c',
              phoneNumber: '+1 (438) 476-3261',
              sandbox: true,
              sandboxExternalId: '50371675753',
              status: 'active',
              type: 'whatsapp',
            },
            {
              appId: '5e31c81640a22c000f5d7f28',
              id: '5e31c81640a22c000f5d7f2n',
              phoneNumber: '+1 (438) 476-3261',
              status: 'inactive',
              type: 'whatsapp',
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
      it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              SecretId: 'us-east-1-dev-smooch-app',
            },
          ]),
        );
      });
      it('passes in the correct arguments to docClient.query()', async () => {
        expect(mockQuery.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              ExpressionAttributeNames: {
                '#integrationType': 'type',
                '#tenantId': 'tenant-id',
              },
              ExpressionAttributeValues: {
                ':t': '66d83870-30df-4a3b-8801-59edff162034',
                ':type': 'app',
              },
              IndexName: 'tenant-id-type-index',
              KeyConditionExpression:
                '#tenantId = :t and #integrationType = :type',
              TableName: 'us-east-1-dev-smooch',
            },
          ]),
        );
      });
      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              keyId: 'id',
              scope: 'app',
              secret: 'secret',
              serviceUrl: 'mock-smooch-api-url',
            },
          ]),
        );
      });
      it('passes in the correct arguments to smooch.integrations.list()', async () => {
        expect(mockList.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              appId: '5e31c81640a22c000f5d7f28',
              types: 'whatsapp',
            },
          ]),
        );
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

  it('sends back status 500 when there is an error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message:
          'An Error has occurred trying to retrieve digital channels credentials',
      },
      status: 500,
    });
  });

  it('throws an error when there is a problem retrieving digital channels credentials', async () => {
    try {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            '5e31c81640a22c000f5d7f28-id': 'id',
            '5e31c81640a22c000f5d7f28-secret': 'secret',
          }),
        }),
      }));
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(
        Promise.reject(
          new Error(
            'An Error has occurred trying to retrieve digital channels credentials',
          ),
        ),
      ).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving digital channels credentials (thrown by SmoochCore)', async () => {
    try {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            '5e31c81640a22c000f5d7f28-id': 'id',
            '5e31c81640a22c000f5d7f28-secret': 'secret',
          }),
        }),
      }));
      mockSmoochCore.mockImplementationOnce(() => {
        throw new Error('SmoochCore');
      });
      await handler(event);
    } catch (error) {
      expect(
        Promise.reject(
          new Error(
            'An Error has occurred trying to validate digital channels credentials',
          ),
        ),
      ).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('sends back status 500 when there is a problem fetching apps in DynamoDB', async () => {
    mockQuery.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'An Error has occurred trying to fetch apps in DynamoDB',
        queryParams: {
          ExpressionAttributeNames: {
            '#integrationType': 'type',
            '#tenantId': 'tenant-id',
          },
          ExpressionAttributeValues: {
            ':t': '66d83870-30df-4a3b-8801-59edff162034',
            ':type': 'app',
          },
          IndexName: 'tenant-id-type-index',
          KeyConditionExpression: '#tenantId = :t and #integrationType = :type',
          TableName: 'us-east-1-dev-smooch',
        },
      },
      status: 500,
    });
  });

  it('sends back status 500 when there is an error retrieving integrations', async () => {
    mockList.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'An error occured trying to retrieve whatsapp integrations',
      },
      status: 500,
    });
  });
});
