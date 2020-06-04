const { lambda: { api: { validateTenantPermissions } } } = require('alonzo');

jest.mock('alonzo');

validateTenantPermissions.mockReturnValue(true);

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

const mockQuery = jest.fn(() => {})
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

describe('get-smooch-web-integrations', () => {
  describe('Everything  is successful', () => {
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
      it('passes in the correct arguments to docClient.query()', async () => {
        expect(mockQuery.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('sends back status 400 error when there are invalid params valus', async () => {
    const mockEvent = {
      params: {},
      identity: {
        'user-id': '66d83870-30df-4a3b-8801-59edff162034',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });
  it('sends back status 400 error when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 error when there is a problem fetching apps in DynamoDB', async () => {
    mockQuery.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
