function validateReplayRequest(req, res, done) {
  const mandatoryFields = ['first_node', 'last_node', 'payload', 'input_type'];
  const { body } = req;
  const missingPayloadKeys = mandatoryFields.filter((field) => !Object.keys(body).includes(field)) || [];

  if (missingPayloadKeys?.length === 0) {
    done();
  } else {
    res.status(400).send({ msg: `Payload is missing one or more mandatory fields: ${missingPayloadKeys}` });
  }
}

module.exports = {
  validateReplayRequest
}