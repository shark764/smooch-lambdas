const { validateTenantPermissions, validatePlatformPermissions } = require('serenova-js-utils/lambda/api');

jest.mock('aws-sdk');
jest.mock('serenova-js-utils/lambda/api');

validateTenantPermissions.mockReturnValue(true);
validatePlatformPermissions.mockReturnValue(true);

beforeAll(() => {
  global.process.env = {
    AWS_REGION: 'us-east-1',
    ENVIRONMENT: 'dev',
  };
});

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

const mockQuery = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Count: 1,
      Items: [{
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      }],
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

describe('get-smooch-apps', () => {
  describe('Everything is successful', () => {
    it('sends back status 200 if the code runs without error ', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        await handler(event);
      });
      it('passes in the correct arguments to validateTenantPermissions', async () => {
        expect(validateTenantPermissions.mock.calls).toMatchSnapshot();
      });
      it('passes in the correct arguments to validatePlatformPermissions', async () => {
        expect(validatePlatformPermissions.mock.calls).toMatchSnapshot();
      });
      it('passes in the correct arguments to docClient.query()', async () => {
        expect(mockQuery.mock.calls).toMatchSnapshot();
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
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    validatePlatformPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a problem fetching apps in DynamoDB', async () => {
    mockQuery.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
