const axios = require('axios');

jest.mock('axios');

const event = {};

const mockGetSecretValue = jest.fn().mockImplementation(() => ({
  promise: () => ({
    SecretString: JSON.stringify({
      username: 'UserName',
      password: 'Password',
    }),
  }),
}));

axios.mockImplementation();

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
}));

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

      it('passes in the correct arguments to secretsClient.getSecretValue() to get cx credentials', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('throws an error when there is a problem trying to rettrieve cx credentials', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving cx credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
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
