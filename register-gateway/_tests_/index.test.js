const axios = require('axios');

jest.mock('axios');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  ACCOUNT_ID: '460140541257',
};

const event = {
  params: {
    auth: 'given-auth',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

axios.mockImplementation();

const { handler } = require('../index');

describe('register-gateway', () => {
  describe('Everything is successful', () => {
    it('returns when the code runs without any error', async () => {
      const result = handler(event);
      expect(result).toBeTruthy();
    });

    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('throws an error when there is a problem callind endpoint to register gateway', async () => {
    try {
      axios.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error calling API to register gateway'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
