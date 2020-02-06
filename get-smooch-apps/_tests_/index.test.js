const { validateTenantPermissions, validatePlatformPermissions } = require('serenova-js-utils/lambda/api');

jest.mock('aws-sdk');
jest.mock('serenova-js-utils/lambda/api');

validateTenantPermissions.mockReturnValue(true);
validatePlatformPermissions.mockReturnValue(true);

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
      Count: 0,
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

describe('get-smooch-apps', async () => {
  describe('', async () => {
    let result;
    beforeAll(async () => {
      result = await handler(event);
    });
    it('should send back status 200 if the code runs without error ', async () => {
      expect(result).toMatchSnapshot();
    });
    it('should send back arguments with which validateTenantPermissions was called', async () => {
      expect(validateTenantPermissions.mock.calls).toMatchSnapshot();
    });
    it('should send back arguments with which validatePlatformPermissions was called', async () => {
      expect(validatePlatformPermissions.mock.calls).toMatchSnapshot();
    });
    it('should send back arguments with which mockQuery was called', async () => {
      expect(mockQuery.mock.calls).toMatchSnapshot();
    });
  });

  it('should send back a 400 error when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    validatePlatformPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('should send back a 500 error when there is a problem fetching apps in DynamoDB', async () => {
    mockQuery.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
