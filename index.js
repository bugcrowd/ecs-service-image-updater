'use strict'

const { ECS } = require("@aws-sdk/client-ecs");
const async = require('async');
const _ = require('lodash');

// Set the default region to 'us-east-1' if not already set
const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';

const updater = function (options, cb) {
  async.waterfall([
    (next) => updater.currentTaskDefinition(options, next),
    (currentTaskDefinition, next) => {
      const newTaskDefinition = updater.updateTaskDefinitionImage(
        currentTaskDefinition,
        options.containerNames,
        options.image
      );

      return updater.createTaskDefinition(newTaskDefinition, next);
    },
    (taskDefinition, next) => {
      if (!options.serviceName) return next(null, taskDefinition.taskDefinitionArn);
      return updater.updateService(options, taskDefinition.taskDefinitionArn, (err, service) => {
        return next(err, taskDefinition.taskDefinitionArn);
      });
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

    async.parallel([
      (done) => {
        if (!options.taskDefinitionFamily) return done();
        return updater.getLatestActiveTaskDefinition(options, done);
      },
      (done) => {
        if (!options.serviceName) return done();
        return updater.getServiceTaskDefinition(options, done)
      }
    ], (err, results) => {
      if (err) return cb(err);
      const taskDefinitionArn = _.filter(results, (result) => result)[0];
      if (!taskDefinitionArn) return cb(new Error('Error could not find task definition'));
      updater.getTaskDefinition(taskDefinitionArn, cb);
    });
  },

  /**
   * getServiceTaskDefinition
   *
   * Retrieve the active Task Definition Arn on a service
   * @param {object} options A hash of options used when initiating this deployment
   * @param {function} cb Callback
   */
  getServiceTaskDefinition(options, cb) {
    const ecs = new ECS({ region: region });

    const params = {
      cluster: options.clusterArn,
      services: [options.serviceName]
    };

    ecs.describeServices(params)
      .then((data) => {
        const service = _.find(data.services, (s) => s.serviceName === options.serviceName);
        if (!service) return cb(new Error(`Could not find service "${options.serviceName}"`));

        cb(null, service.taskDefinition);
      })
      .catch(err => cb(err));
  },

  /**
   * getLatestActiveTaskDefinition
   *
   * Retrieve the newest Task Definition Arn in a Task Definition Family
   * @param {object} options A hash of options used when initiating this deployment
   * @param {function} cb Callback
   */
  getLatestActiveTaskDefinition(options, cb) {
    const ecs = new ECS({ region: region });

    const params = {
      familyPrefix: options.taskDefinitionFamily,
      sort: 'DESC',
      status: 'ACTIVE'
    };

    ecs.listTaskDefinitions(params)
      .then((data) => {
        if (data.taskDefinitionArns.length === 0) {
          return cb(new Error(`No Task Definitions found in family "${family}"`));
        }

        cb(null, data.taskDefinitionArns[0]);
      })
      .catch(err => cb(err));
  },

  /**
   * getTaskDefinition
   *
   * Retrieve a task definition
   * @param {object} options A hash of options used when initiating this deployment
   * @param {function} cb Callback
   */
  getTaskDefinition(taskDefinitionArn, cb) {
    const ecs = new ECS({ region: region });
    const params = { taskDefinition: taskDefinitionArn };

    ecs.describeTaskDefinition(params)
      .then(data => cb(null, data.taskDefinition))
      .catch(err => cb(err));
  },

  updateTaskDefinitionImage(taskDefinition, containerNames, image) {
    if (!_.isArray(containerNames)) containerNames = [containerNames];

    const newTaskDefinition = _.clone(taskDefinition);
    containerNames.forEach((containerName) => {
      const containerIndex = _.findIndex(newTaskDefinition.containerDefinitions, (containerDefinition) => {
        return containerDefinition.name === containerName;
      });

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
   * createTaskDefinition
   *
   * Create a new Task Definition based on the currently deployed
   * Task Definition but with an updated container image.
   *
   * @param {object} newTaskDefinition New task definition to create
   * @param {function} cb Callback
   */
  createTaskDefinition(newTaskDefinition, cb) {
    const ecs = new ECS({ region: region });

    ecs.registerTaskDefinition(newTaskDefinition)
      .then(data => cb(null, data.taskDefinition))
      .catch(err => cb(err));
  },

  /**
   * updateService
   *
   * Update the service to use a new Task Definition
   * @param {object} options A hash of options used when initiating this deployment
   * @param {sting} taskDefinitionArn The task definition to deploy
   * @param {function} cb Callback
   */
  updateService(options, taskDefinitionArn, cb) {
    const ecs = new ECS({ region: region });
    const params = {
      cluster: options.clusterArn,
      service: options.serviceName,
      taskDefinition: taskDefinitionArn
    };

    ecs.updateService(params)
      .then(data => cb(null, data.service))
      .catch(err => cb(err));
  },
});

module.exports = updater;
