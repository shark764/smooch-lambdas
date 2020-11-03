const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('create-whatsapp-integration was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API create-whatsapp-integration called successfully',
    },
  };
};
