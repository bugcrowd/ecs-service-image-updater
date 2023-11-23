'use strict'

const { ECS } = require("@aws-sdk/client-ecs");
const async = require('async');
const _ = require('lodash');

// Set the default region to 'us-east-1' if not already set
const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';

const updater = function (options, cb) {
  const ecs = new ECS({ region: region });

  async.waterfall([
    (next) => updater.currentTaskDefinition(options, next),
    (currentTaskDefinition, next) => {
      const newTaskDefinition = updater.updateTaskDefinitionImage(
        currentTaskDefinition,
        options.containerNames,
        options.image
      );

      ecs.registerTaskDefinition(newTaskDefinition)
        .then(data => next(null, data.taskDefinition))
        .catch(err => next(err));
    },
    (taskDefinition, next) => {
      if (!options.serviceName) return next(null, taskDefinition.taskDefinitionArn);

      updater.updateService(options, taskDefinition.taskDefinitionArn)
        .then(service => next(null, taskDefinition.taskDefinitionArn))
        .catch(err => next(err));
    }
  ], cb);
}

Object.assign(updater, {
  /**
   * currentTaskDefinition
   *
   * Retrieve the currently deployed Task Definintion
   * @param {object} options A hash of options used when initiating this deployment
   * @param {function} cb Callback
   */
  currentTaskDefinition(options, cb) {
    if (!options.serviceName && !options.taskDefinitionFamily) {
      return cb(new Error('Ensure either the serviceName or taskDefinitionFamily option are specified'));
    }

    Promise.all([
      updater.getLatestActiveTaskDefinition(options),
      updater.getServiceTaskDefinition(options)
    ])
      .then((results) => {
        const taskDefinitionArn = _.filter(results, (result) => result)[0];
        if (!taskDefinitionArn) throw new Error('Error could not find task definition');

        return updater.getTaskDefinition(taskDefinitionArn);
      })
      .then(taskDefinition => cb(null, taskDefinition))
      .catch(err => cb(err));
  },

  /**
   * getServiceTaskDefinition
   *
   * Retrieve the active Task Definition Arn on a service
   * @param {object} options A hash of options used when initiating this deployment
   * @return {Promise}
   */
  getServiceTaskDefinition(options) {
    if (!options.serviceName) return Promise.resolve();

    const ecs = new ECS({ region: region });

    const params = {
      cluster: options.clusterArn,
      services: [options.serviceName]
    };

    return ecs.describeServices(params)
      .then((data) => {
        const service = _.find(data.services, (s) => s.serviceName === options.serviceName);
        if (!service) throw new Error(`Could not find service "${options.serviceName}"`);

        return service.taskDefinition;
      });
  },

  /**
   * getLatestActiveTaskDefinition
   *
   * Retrieve the newest Task Definition Arn in a Task Definition Family
   * @param {object} options A hash of options used when initiating this deployment
   * @return {Promise}
   */
  getLatestActiveTaskDefinition(options) {
    if (!options.taskDefinitionFamily) return Promise.resolve();

    const ecs = new ECS({ region: region });

    const params = {
      familyPrefix: options.taskDefinitionFamily,
      sort: 'DESC',
      status: 'ACTIVE'
    };

    return ecs.listTaskDefinitions(params)
      .then((data) => {
        if (data.taskDefinitionArns.length === 0) {
          throw new Error(`No Task Definitions found in family "${family}"`);
        }

        return data.taskDefinitionArns[0];
      });
  },

  /**
   * getTaskDefinition
   *
   * Retrieve a task definition
   * @param {object} options A hash of options used when initiating this deployment
   * @return {Promise}
   */
  getTaskDefinition(taskDefinitionArn) {
    const ecs = new ECS({ region: region });
    const params = { taskDefinition: taskDefinitionArn };

    return ecs.describeTaskDefinition(params)
      .then(data => data.taskDefinition);
  },

  updateTaskDefinitionImage(taskDefinition, containerNames, image) {
    if (!_.isArray(containerNames)) containerNames = [containerNames];

    const newTaskDefinition = _.clone(taskDefinition);
    containerNames.forEach((containerName) => {
      const containerIndex = _.findIndex(newTaskDefinition.containerDefinitions, (containerDefinition) => {
        return containerDefinition.name === containerName;
      });

      // Container was not found in the existing task definition
      if (containerIndex === -1) {
        throw new Error(`Could not find container name "${containerName}" in existing task definition`);
      }

      newTaskDefinition.containerDefinitions[containerIndex].image = image;
    });

    return _.pick(newTaskDefinition, [
      'containerDefinitions',
      'executionRoleArn',
      'family',
      'networkMode',
      'placementConstraints',
      'taskRoleArn',
      'volumes',
      'requiresCompatibilities',
      'cpu',
      'memory'
    ]);
  },

  /**
   * updateService
   *
   * Update the service to use a new Task Definition
   * @param {object} options A hash of options used when initiating this deployment
   * @param {sting} taskDefinitionArn The task definition to deploy
   * @return {Promise}
   */
  updateService(options, taskDefinitionArn) {
    const ecs = new ECS({ region: region });
    const params = {
      cluster: options.clusterArn,
      service: options.serviceName,
      taskDefinition: taskDefinitionArn
    };

    return ecs.updateService(params)
      .then(data => data.service);
  },
});

module.exports = updater;
