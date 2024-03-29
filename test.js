'use strict'

const expect = require('expect.js');
const {
  ECS,
  DescribeServicesCommand,
  ListTaskDefinitionsCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand
} = require('@aws-sdk/client-ecs');
const { mockClient } = require('aws-sdk-client-mock');

const updater = require('./');

describe('ECS Service Image Updater', function () {
  const ecsMock = mockClient(ECS);

  const oldGetServiceTaskDefinition = updater.getServiceTaskDefinition;
  const oldGetLatestActiveTaskDefinition = updater.getLatestActiveTaskDefinition;
  const oldGetTaskDefinition = updater.getTaskDefinition;

  afterEach(() => {
    ecsMock.reset();

    updater.getServiceTaskDefinition = oldGetServiceTaskDefinition;
    updater.getLatestActiveTaskDefinition = oldGetLatestActiveTaskDefinition;
    updater.getTaskDefinition = oldGetTaskDefinition;
  });

  it('currentTaskDefinition should return the current task definition from in Service', function (done) {
    const serviceName = 'planet-express';
    const taskDefinitionArn = 'arn::good-news:96';

    updater.getServiceTaskDefinition = () => Promise.resolve(taskDefinitionArn);
    updater.getTaskDefinition = () => Promise.resolve({ taskDefinitionArn: taskDefinitionArn });

    updater.currentTaskDefinition({ serviceName: serviceName })
      .then((taskDefinition) => {
        expect(taskDefinition.taskDefinitionArn).to.equal(taskDefinitionArn);
        done();
      });
  });

  it('currentTaskDefinition should return the current task definition in a Task Definition Family', function (done) {
    const family = 'simpsons';
    const taskDefinitionArn = 'arn::good-news:96';

    updater.getLatestActiveTaskDefinition = () => Promise.resolve(taskDefinitionArn);
    updater.getTaskDefinition = _taskDefinitionArnSupplied => Promise.resolve({ taskDefinitionArn: taskDefinitionArn });

    updater.currentTaskDefinition({ taskDefinitionFamily: family })
      .then((taskDefinition) => {
        expect(taskDefinition.taskDefinitionArn).to.equal(taskDefinitionArn);
        done();
      });
  });

  it('getServiceTaskDefinition should get the active task definition in Service', function (done) {
    const serviceName = 'planet-express';
    const taskDefinitionArn = 'arn::good-news:96';

    ecsMock.on(DescribeServicesCommand).callsFake((params) => {
      expect(params.services).to.eql([serviceName]);

      const data = {
        services: [
          { serviceName: '1', taskDefinition: 'arn' },
          { serviceName: serviceName, taskDefinition: taskDefinitionArn }
        ]
      }
      return Promise.resolve(data);
    });

    updater.getServiceTaskDefinition({ serviceName: serviceName })
      .then((taskDefinitionArnReturned) => {
        expect(taskDefinitionArnReturned).to.equal(taskDefinitionArn);
        done();
      });
  });

  it('getLatestActiveTaskDefinition should get the latest task definition in a Task Definition Family', function (done) {
    const family = 'simpsons';

    ecsMock.on(ListTaskDefinitionsCommand).callsFake((params) => {
      expect(params).to.eql({
        familyPrefix: family,
        sort: 'DESC',
        status: 'ACTIVE'
      });

      const data = {
        taskDefinitionArns: [
          "arn:2",
          "arn:1",
        ]
      }
      return Promise.resolve(data);
    });

    updater.getLatestActiveTaskDefinition({ taskDefinitionFamily: family })
      .then((taskDefinitionArnReturned) => {
        expect(taskDefinitionArnReturned).to.equal("arn:2");
        done();
      });
  });

  it('getTaskDefinition should return a task definition', function (done) {
    const taskDefinitionArn = 'arn::good-news:96';

    ecsMock.on(DescribeTaskDefinitionCommand).callsFake((params) => {
      expect(params.taskDefinition).to.equal(taskDefinitionArn);
      return Promise.resolve({ taskDefinition: { taskDefinitionArn: taskDefinitionArn } });
    });

    updater.getTaskDefinition(taskDefinitionArn)
      .then((taskDefinition) => {
        expect(taskDefinition.taskDefinitionArn).to.equal(taskDefinitionArn);
        done();
      });
  });

  it('updateTaskDefinitionImage should update a task definition with a new image', function () {
    const container = 'app';
    const image = 'image:2';
    const taskDefinition = {
      taskDefinitionArn: 'arn',
      executionRoleArn: 'arn:role',
      containerDefinitions: [
        {
          name: container,
          image: 'image:1'
        }
      ]
    };

    const updatedTaskDefinition = updater.updateTaskDefinitionImage(taskDefinition, container, image);
    expect(updatedTaskDefinition['containerDefinitions'][0]['image']).to.equal(image);
    expect(updatedTaskDefinition['executionRoleArn']).to.equal(taskDefinition.executionRoleArn);
  });

  it('updateTaskDefinitionImage should update a task definition with a new image in multiple containers', function () {
    const oldImage = 'image:1';
    const newImage = 'image:2';

    const taskDefinition = {
      taskDefinitionArn: 'arn',
      containerDefinitions: [
        {
          name: 'app',
          image: oldImage
        },
        {
          name: 'worker',
          image: oldImage
        },
        {
          name: 'db',
          image: oldImage
        }
      ]
    };

    const updatedTaskDefinition = updater.updateTaskDefinitionImage(taskDefinition, ['app', 'worker'], newImage);
    expect(updatedTaskDefinition['containerDefinitions'][0]['image']).to.equal(newImage);
    expect(updatedTaskDefinition['containerDefinitions'][1]['image']).to.equal(newImage);
    expect(updatedTaskDefinition['containerDefinitions'][2]['image']).to.equal(oldImage);
  });

  it('updateService should update Service to use new Task Definition', function (done) {
    ecsMock.on(UpdateServiceCommand).callsFake((params) => {
      expect(params).to.eql({
        cluster: 'arn:cluster',
        service: 'serviceName',
        taskDefinition: 'arn:taskDefinition'
      });
      return Promise.resolve({ 'service': { serviceName: 'serviceName' } });
    });

    const options = {
      clusterArn: 'arn:cluster',
      serviceName: 'serviceName',
    };

    updater.updateService(options, 'arn:taskDefinition')
      .then((service) => {
        expect(service).to.eql({ serviceName: 'serviceName' });
        done();
      });
  });

  describe('Wrap up', function () {
    const oldCurrentTaskDefinitionFn = updater.currentTaskDefinition;
    const oldUpdateTaskDefinitionImageFn = updater.updateTaskDefinitionImage;
    const oldUpdateServiceFn = updater.updateService;

    const options = {
      clusterArn: 'arn:cluster',
      serviceName: 'serviceName',
      containerNames: ['containerName'],
      image: 'image:1'
    };

    after(() => {
      updater.currentTaskDefinition = oldCurrentTaskDefinitionFn;
      updater.updateTaskDefinitionImage = oldUpdateTaskDefinitionImageFn;
      updater.updateService = oldUpdateServiceFn;
    });

    it('should do it all more good', function (done) {
      updater.currentTaskDefinition = (optionsSupplied) => {
        expect(optionsSupplied).to.eql(options);
        return Promise.resolve({ taskDefinitionArn: 'arn' });
      };

      updater.updateTaskDefinitionImage = function (taskDefinition, containerName, image) {
        expect(taskDefinition.taskDefinitionArn).to.equal('arn');
        expect(containerName).to.eql(['containerName']);
        expect(image).to.equal('image:1');
        return { taskDefinitionArn: 'arn:updated' };
      };

      ecsMock.on(RegisterTaskDefinitionCommand).callsFake((taskDefinition) => {
        expect(taskDefinition.taskDefinitionArn).to.equal('arn:updated');
        return Promise.resolve({ taskDefinition: { taskDefinitionArn: 'arn:created' } });
      });

      updater.updateService = (optionsSupplied, taskDefinitionArn) => {
        expect(optionsSupplied).to.eql(options);
        expect(taskDefinitionArn).to.equal('arn:created');
        return Promise.resolve({ taskDefinition: 'arn:created' });
      }

      updater(options)
        .then(() => done());
    });
  });
});
