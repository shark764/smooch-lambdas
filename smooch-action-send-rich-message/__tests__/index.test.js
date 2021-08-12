const axios = require('axios');
const { v1: uuidv1 } = require('uuid');
// const { parseEDNString } = require('edn-data');

const { getMetadata } = require('../resources/commonFunctions');

jest.mock('axios');
jest.mock('uuid');

jest.mock('../resources/commonFunctions');

getMetadata.mockImplementation(() => ({
  data: {
    appId: 'mock-app-id',
    userId: 'mock-user-id',
  },
}));

uuidv1.mockReturnValue('mock-id');

const event = {
  Records: [{
    body: JSON.stringify({
      'tenant-id': 'mock-tenant-id',
      'sub-id': 'mock-sub-id',
      'interaction-id': 'mock-interaction-id',
      id: 'mock-action-id',
      metadata: {
        'app-id': 'mock-app-id',
        'user-id': 'mock-user-id',
        source: 'web',
        participants: [{
          'resource-id': 'mock-resource-id',
        }],
        'conversation-id': 'mock-conversation-id',
      },
      parameters: {
        from: 'from',
        text: 'text',
        'wait-for-response': true,
        message: '{:type "text", :text "abc", :actions[{:type "reply", :text "reply text 1",:payload "reply payload 1"}{:type "reply", :text "reply text 2", :payload "reply payload 2"}]}',
      },
    }),
  }],
};

const nonWebEvent = {
  Records: [{
    body: JSON.stringify({
      'tenant-id': 'mock-tenant-id',
      'sub-id': 'mock-sub-id',
      'interaction-id': 'mock-interaction-id',
      id: 'mock-action-id',
      metadata: {
        'app-id': 'mock-app-id',
        'user-id': 'mock-user-id',
        source: 'messenger',
        participants: [{
          'resource-id': 'mock-resource-id',
        }],
        'conversation-id': 'mock-conversation-id',
      },
      parameters: {
        from: 'from',
        text: 'text',
        'wait-for-response': true,
        message: '{:type "text", :text "abc", :actions[{:type "reply", :text "reply text 1",:payload "reply payload 1"}{:type "reply", :text "reply text 2", :payload "reply payload 2"}]}',
      },
    }),
  }],
};

const mockSqsGetQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      QueueUrl: 'queueurl',
    }),
  }));

axios.mockImplementation(() => ({
  promise: () => ({}),
}));

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'username',
        password: 'paasword',
      }),
    }),
  }))
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        'mock-app-id-id': 'id',
        'mock-app-id-secret': 'secret',
      }),
    }),
  }));

const mockPostMessage = jest.fn()
  .mockImplementation(() => ({
    messages: [{
      id: 'id',
      received: 1000,
      content: {
        text: 'text',
      },
    }],
  }));

const mockAuthentication = {
  basicAuth: {
    username: 'id',
    password: 'secret',
  },
};

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Item: {
        InteractionId: 'mock-interaction-id',
        CollectActions: [],
      },
    }),
  }));

const mockSqsSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockUpdate = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      update: mockUpdate, // mockUpdate,
    })),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockSqsGetQueueUrl,
    sendMessage: mockSqsSendMessage,
  })),
}));

jest.mock('sunshine-conversations-client', () => ({
  ApiClient: {
    instance: {
      authentications: mockAuthentication,
    },
  },
  MessagesApi: jest.fn().mockImplementation(() => ({
    postMessage: mockPostMessage,
  })),
  MessagePost: jest.fn().mockImplementation(() => ({})),
}));

const { handler } = require('../index');

describe('smooch-action-send-rich-message', () => {
  describe('Everthing is successful', () => {
    it('when wait for response is false - web', async () => {
      jest.clearAllMocks();
      const result = await handler(event);
      expect(result).toEqual('smooch-action-send-rich-message successful');
    });

    it('when wait for response is true - web', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': 'mock-tenant-id',
            'sub-id': 'mock-sub-id',
            'interaction-id': 'mock-interaction-id',
            id: 'mock-action-id',
            metadata: {
              'app-id': 'mock-app-id',
              'user-id': 'mock-user-id',
              source: 'web',
              participants: [{
                'resource-id': 'mock-resource-id',
              }],
              'conversation-id': 'mock-conversation-id',
            },
            parameters: {
              from: 'from',
              text: 'text',
              'wait-for-response': false,
              message: '{:type "text", :text "abc", :actions[{:type "reply", :text "reply text 1",:payload "reply payload 1"}{:type "reply", :text "reply text 2", :payload "reply payload 2"}]}',
            },
          }),
        }],
      };
      const mockResult = await handler(mockEvent);
      expect(mockResult).toEqual('smooch-action-send-rich-message successful');
    });
  });

  describe('Web Walkthrough', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
      await handler(event);
    });
    it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
      expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
        SecretId: 'us-east-1-dev-smooch-cx',
      }]));
    });

    it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
      expect(mockGetSecretValue.mock.calls[1]).toEqual(expect.arrayContaining([{
        SecretId: 'us-east-1-dev-smooch-app',
      }]));
    });

    it('passes in the correct arguments to DynamoDB get', async () => {
      expect(mockGet).toBeCalled();
      expect(mockUpdate.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to DynamoDB update', async () => {
      expect(mockUpdate).toBeCalled();
      expect(mockUpdate.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to Smooch', async () => {
      expect(mockPostMessage.mock.calls).toMatchSnapshot();
    });

    it('handles a form message', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': 'mock-tenant-id',
            'sub-id': 'mock-sub-id',
            'interaction-id': 'mock-interaction-id',
            id: 'mock-action-id',
            metadata: {
              'app-id': 'mock-app-id',
              'user-id': 'mock-user-id',
              source: 'web',
              participants: [{
                'resource-id': 'mock-resource-id',
              }],
              'conversation-id': 'mock-conversation-id',
            },
            parameters: {
              from: 'from',
              text: 'text',
              'wait-for-response': false,
              message: '{:type "form", :fields[{:type "text", :name "text", :label "Text?"}]}',
            },
          }),
        }],
      };
      await handler(mockEvent);
      expect(mockSqsSendMessage).not.toHaveBeenCalled();
    });

    it('handles a CxEngageHiddenMessage', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': 'mock-tenant-id',
            'sub-id': 'mock-sub-id',
            'interaction-id': 'mock-interaction-id',
            id: 'mock-action-id',
            metadata: {
              'app-id': 'mock-app-id',
              'user-id': 'mock-user-id',
              source: 'web',
              participants: [{
                'resource-id': 'mock-resource-id',
              }],
              'conversation-id': 'mock-conversation-id',
            },
            parameters: {
              from: 'CxEngageHiddenMessage',
              text: 'text',
              'wait-for-response': false,
              message: '{:type "form", :fields[{:type "text", :name "text", :label "Text?"}]}',
            },
          }),
        }],
      };
      const mockResult = await handler(mockEvent);
      expect(mockResult).toEqual('smooch-action-send-rich-message successful');
    });
  });

  describe('Non web Walkthrough', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
      await handler(nonWebEvent);
    });
    it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
      expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
        SecretId: 'us-east-1-dev-smooch-cx',
      }]));
    });

    it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
      expect(mockGetSecretValue.mock.calls[1]).toEqual(expect.arrayContaining([{
        SecretId: 'us-east-1-dev-smooch-app',
      }]));
    });

    it('passes in the correct arguments to Smooch', async () => {
      expect(mockPostMessage.mock.calls).toMatchSnapshot();
    });

    it('throws error on form message for non web source ', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': 'mock-tenant-id',
            'sub-id': 'mock-sub-id',
            'interaction-id': 'mock-interaction-id',
            id: 'mock-action-id',
            metadata: {
              'app-id': 'mock-app-id',
              'user-id': 'mock-user-id',
              source: 'messenger',
              participants: [{
                'resource-id': 'mock-resource-id',
              }],
              'conversation-id': 'mock-conversation-id',
            },
            parameters: {
              from: 'from',
              text: 'text',
              'wait-for-response': false,
              message: '{:type "form", :fields[{:type "text", :name "text", :label "Text?"}]}',
            },
          }),
        }],
      };
      const result = await handler(mockEvent);
      expect(result).toEqual('unsupported message type');
      expect(mockSqsSendMessage).toHaveBeenCalled();
    });
  });


  describe('Message Types Walkthrough', () => {
    jest.clearAllMocks();
    it('handles a image message', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': 'mock-tenant-id',
            'sub-id': 'mock-sub-id',
            'interaction-id': 'mock-interaction-id',
            id: 'mock-action-id',
            metadata: {
              'app-id': 'mock-app-id',
              'user-id': 'mock-user-id',
              source: 'web',
              participants: [{
                'resource-id': 'mock-resource-id',
              }],
              'conversation-id': 'mock-conversation-id',
            },
            parameters: {
              from: 'from',
              text: 'text',
              'wait-for-response': false,
              message: '{:type "image", :mediaUrl "https://www.xyz.com/image.jpg", :altText "alttext"}',
            },
          }),
        }],
      };
      const mockResult = await handler(mockEvent);
      expect(mockResult).toEqual('smooch-action-send-rich-message successful');
    });

    it('handles a location message', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': 'mock-tenant-id',
            'sub-id': 'mock-sub-id',
            'interaction-id': 'mock-interaction-id',
            id: 'mock-action-id',
            metadata: {
              'app-id': 'mock-app-id',
              'user-id': 'mock-user-id',
              source: 'web',
              participants: [{
                'resource-id': 'mock-resource-id',
              }],
              'conversation-id': 'mock-conversation-id',
            },
            parameters: {
              from: 'from',
              text: 'text',
              'wait-for-response': false,
              message: '{:type "location", :coordinates {:lat 1232, :long 3454}, :location {:address "defwe", :name "aefef"}}',
            },
          }),
        }],
      };
      const mockResult = await handler(mockEvent);
      expect(mockResult).toEqual('smooch-action-send-rich-message successful');
    });

    it('handles a location message', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': 'mock-tenant-id',
            'sub-id': 'mock-sub-id',
            'interaction-id': 'mock-interaction-id',
            id: 'mock-action-id',
            metadata: {
              'app-id': 'mock-app-id',
              'user-id': 'mock-user-id',
              source: 'web',
              participants: [{
                'resource-id': 'mock-resource-id',
              }],
              'conversation-id': 'mock-conversation-id',
            },
            parameters: {
              from: 'from',
              text: 'text',
              'wait-for-response': false,
              message: '{:type "location", :coordinates {:lat 1232, :long 3454}, :location {:address "defwe", :name "aefef"}}',
            },
          }),
        }],
      };
      const mockResult = await handler(mockEvent);
      expect(mockResult).toEqual('smooch-action-send-rich-message successful');
    });

    it('handles a carousel message', async () => {
      jest.clearAllMocks();
      const mockEvent = {
        Records: [{
          body: JSON.stringify({
            'tenant-id': 'mock-tenant-id',
            'sub-id': 'mock-sub-id',
            'interaction-id': 'mock-interaction-id',
            id: 'mock-action-id',
            metadata: {
              'app-id': 'mock-app-id',
              'user-id': 'mock-user-id',
              source: 'web',
              participants: [{
                'resource-id': 'mock-resource-id',
              }],
              'conversation-id': 'mock-conversation-id',
            },
            parameters: {
              from: 'from',
              text: 'text',
              'wait-for-response': false,
              message: '{:type "carousel",:items [{:title "title", :description "Description", :mediaUrl "mediaurl", :actions [{:text "Select", :type "postback", :payload "payload"} {:text "More info", :type "link", :uri "uri"}]} {:title "title2", :description "Description2", :mediaUrl "mediaurl2", :actions [{:text "Select2", :type "postback", :payload "payload2"} {:text "More info2", :type "link", :uri "uri2"}]}]}',
            },
          }),
        }],
      };
      const mockResult = await handler(mockEvent);
      expect(mockResult).toEqual('smooch-action-send-rich-message successful');
    });
  });

  it('throws an error when there is a problem retrieving cx credentials', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving cx credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving digital channels credentials', async () => {
    try {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            username: 'username',
            password: 'paasword',
          }),
        }),
      }));
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending smooch message to customer', async () => {
    try {
      mockPostMessage.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending smooch message to customer'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws a warning when there is a error sending an error response', async () => {
    try {
      mockPostMessage.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending smooch message and error response to customer'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws a error when there is a error updating collect actions', async () => {
    try {
      mockUpdate.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('An error ocurred updating collectActions'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws a error when there is a error getting interaction', async () => {
    try {
      mockGet.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws a warning when there existing collect actions for non web', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({
        Item: {
          InteractionId: 'mock-interaction-id',
          CollectActions: [{ actionId: 'mock-action-id', subId: 'mock-sub-id' }],
        },
      }),
    }));
    const result = await handler(nonWebEvent);
    expect(result).toMatchSnapshot();
  });

  it('throws a warning when there existing collect actions for web', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({
        Item: {
          InteractionId: 'mock-interaction-id',
          CollectActions: [{ actionId: 'mock-action-id', subId: 'mock-sub-id' }],
        },
      }),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('throws a warning when there is old interaction id for web', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({
        Item: {
          InteractionId: 'mock-interaction-id-2',
          CollectActions: [{ actionId: 'mock-action-id', subId: 'mock-sub-id' }],
        },
      }),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('throws a warning when there is no interaction for web', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('throws a error warning when platform type is unsupported', async () => {
    jest.clearAllMocks();
    const mockEvent = {
      Records: [{
        body: JSON.stringify({
          'tenant-id': 'mock-tenant-id',
          'sub-id': 'mock-sub-id',
          'interaction-id': 'mock-interaction-id',
          id: 'mock-action-id',
          metadata: {
            'app-id': 'mock-app-id',
            'user-id': 'mock-user-id',
            source: 'abc',
            participants: [{
              'resource-id': 'mock-resource-id',
            }],
            'conversation-id': 'mock-conversation-id',
          },
          parameters: {
            from: 'from',
            text: 'text',
            'wait-for-response': false,
            message: '{:type "text", :text "abc", :actions[{:type "reply", :text "reply text 1",:payload "reply payload 1"}{:type "reply", :text "reply text 2", :payload "reply payload 2"}]}',
          },
        }),
      }],
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });

  it('throws a error when failed to send error response', async () => {
    jest.clearAllMocks();
    const mockEvent = {
      Records: [{
        body: JSON.stringify({
          'tenant-id': 'mock-tenant-id',
          'sub-id': 'mock-sub-id',
          'interaction-id': 'mock-interaction-id',
          id: 'mock-action-id',
          metadata: {
            'app-id': 'mock-app-id',
            'user-id': 'mock-user-id',
            source: 'web',
            participants: [{
              'resource-id': 'mock-resource-id',
            }],
            'conversation-id': 'mock-conversation-id',
          },
          parameters: {
            from: 'from',
            text: 'text',
            'wait-for-response': false,
            message: '{:type "video", :text "abc", :actions[{:type "reply", :text "reply text 1",:payload "reply payload 1"}{:type "reply", :text "reply text 2", :payload "reply payload 2"}]}',
          },
        }),
      }],
    };
    axios.mockRejectedValueOnce();
    try {
      await handler(mockEvent);
    } catch (error) {
      expect(Promise.reject(new Error('An Error ocurred trying to send an error response'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('fails to parse smooch credentials or credentials does not exists', async () => {
    jest.clearAllMocks();
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({
        SecretString: JSON.stringify({
          username: 'username',
          password: 'paasword',
        }),
      }),
    }))
      .mockImplementation(() => ({
        promise: () => ({}),
      }));
    try {
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Failed to parse smooch credentials or credentials does not exists'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
