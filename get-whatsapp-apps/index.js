const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('get-whatsapp-apps was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API get-whatsapp-apps called successfully',
    },
  };
};
