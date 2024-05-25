const { expect } = require('chai')
const Async = require('async')
const User = require('./helpers/User')
const settings = require('@overleaf/settings')
const CollaboratorsEmailHandler = require('../../../app/src/Features/Collaborators/CollaboratorsEmailHandler')
const Features = require('../../../app/src/infrastructure/Features')
const cheerio = require('cheerio')

const createInvite = (sendingUser, projectId, email, callback) => {
  sendingUser.getCsrfToken(err => {
    if (err) {
      return callback(err)
    }
    sendingUser.request.post(
      {
        uri: `/project/${projectId}/invite`,
        json: {
          email,
          privileges: 'readAndWrite',
        },
      },
      (err, response, body) => {
        if (err) {
          return callback(err)
        }
        expect(response.statusCode).to.equal(200)
        expect(body.error).to.not.exist
        expect(body.invite).to.exist
        callback(null, body.invite)
      }
    )
  })
}

const createProject = (owner, projectName, callback) => {
  owner.createProject(projectName, (err, projectId) => {
    if (err) {
      throw err
    }
    const fakeProject = {
      _id: projectId,
      name: projectName,
      owner_ref: owner,
    }
    callback(err, projectId, fakeProject)
  })
}

const createProjectAndInvite = (owner, projectName, email, callback) => {
  createProject(owner, projectName, (err, projectId, project) => {
    if (err) {
      return callback(err)
    }
    createInvite(owner, projectId, email, (err, invite) => {
      if (err) {
        return callback(err)
      }
      const link = CollaboratorsEmailHandler._buildInviteUrl(project, invite)
      callback(null, project, invite, link)
    })
  })
}

const revokeInvite = (sendingUser, projectId, inviteId, callback) => {
  sendingUser.getCsrfToken(err => {
    if (err) {
      return callback(err)
    }
    sendingUser.request.delete(
      {
        uri: `/project/${projectId}/invite/${inviteId}`,
      },
      err => {
        if (err) {
          return callback(err)
        }
        callback()
      }
    )
  })
}

// Actions
const tryFollowInviteLink = (user, link, callback) => {
  user.request.get(
    {
      uri: link,
      baseUrl: null,
    },
    callback
  )
}

const tryAcceptInvite = (user, invite, callback) => {
  user.getCsrfToken(err => {
    if (err) {
      return callback(err)
    }
    user.request.post(
      {
        uri: `/project/${invite.projectId}/invite/token/${invite.token}/accept`,
        json: {
          token: invite.token,
        },
      },
      callback
    )
  })
}

const tryFollowLoginLink = (user, loginLink, callback) => {
  user.getCsrfToken(error => {
    if (error != null) {
      return callback(error)
    }
    user.request.get(loginLink, callback)
  })
}

const tryLoginUser = (user, callback) => {
  user.getCsrfToken(error => {
    if (error != null) {
      return callback(error)
    }
    user.request.post(
      {
        url: '/login',
        json: {
          email: user.email,
          password: user.password,
          'g-recaptcha-response': 'valid',
        },
      },
      callback
    )
  })
}

const tryGetInviteList = (user, projectId, callback) => {
  user.getCsrfToken(error => {
    if (error != null) {
      return callback(error)
    }
    user.request.get(
      {
        url: `/project/${projectId}/invites`,
        json: true,
      },
      callback
    )
  })
}

const tryJoinProject = (user, projectId, callback) => {
  return user.getCsrfToken(error => {
    if (error != null) {
      return callback(error)
    }
    user.request.post(
      {
        url: `/project/${projectId}/join`,
        auth: {
          user: settings.apis.web.user,
          pass: settings.apis.web.pass,
          sendImmediately: true,
        },
        json: { userId: user._id },
        jar: false,
      },
      callback
    )
  })
}

// Expectations
const expectProjectAccess = (user, projectId, callback) => {
  // should have access to project
  user.openProject(projectId, err => {
    expect(err).not.to.exist
    callback()
  })
}

const expectNoProjectAccess = (user, projectId, callback) => {
  // should not have access to project page
  user.openProject(projectId, err => {
    expect(err).to.be.instanceof(Error)
    callback()
  })
}

const expectInvitePage = (user, link, callback) => {
  // view invite
  tryFollowInviteLink(user, link, (err, response, body) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(200)
    expect(body).to.match(/<title>Project Invite - .*<\/title>/)
    callback()
  })
}

const expectInvalidInvitePage = (user, link, callback) => {
  // view invalid invite
  tryFollowInviteLink(user, link, (err, response, body) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(404)
    expect(body).to.match(/<title>Invalid Invite - .*<\/title>/)
    callback()
  })
}

const expectInviteRedirectToRegister = (user, link, callback) => {
  // view invite, redirect to `/register`
  tryFollowInviteLink(user, link, (err, response) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(302)
    expect(response.headers.location).to.match(/^\/register.*$/)

    user.getSession((err, session) => {
      if (err) return callback(err)
      expect(session.sharedProjectData).deep.equals({
        project_name: PROJECT_NAME,
        user_first_name: OWNER_NAME,
      })
      callback()
    })
  })
}

const expectLoginPage = (user, callback) => {
  tryFollowLoginLink(user, '/login', (err, response, body) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(200)
    expect(body).to.match(/<title>(Login|Log in to Overleaf) - .*<\/title>/)
    callback()
  })
}

const expectLoginRedirectToInvite = (user, link, callback) => {
  tryLoginUser(user, (err, response) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(200)
    callback()
  })
}

const expectRegistrationRedirectToInvite = (user, link, callback) => {
  user.register((err, _user, response) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(200)

    if (response.body.redir === '/registration/try-premium') {
      user.request.get('/registration/onboarding', (err, response) => {
        if (err) return callback(err)
        expect(response.statusCode).to.equal(200)
        const dom = cheerio.load(response.body)
        const skipUrl = dom('meta[name="ol-skipUrl"]')[0].attribs.content
        expect(new URL(skipUrl, settings.siteUrl).href).to.equal(
          new URL(link, settings.siteUrl).href
        )
        callback()
      })
    } else {
      expect(response.body.redir).to.equal(link)
      callback()
    }
  })
}

const expectInviteRedirectToProject = (user, link, invite, callback) => {
  // view invite, redirect straight to project
  tryFollowInviteLink(user, link, (err, response) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(302)
    expect(response.headers.location).to.equal(`/project/${invite.projectId}`)
    callback()
  })
}

const expectAcceptInviteAndRedirect = (user, invite, callback) => {
  // should accept the invite and redirect to project
  tryAcceptInvite(user, invite, (err, response) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(302)
    expect(response.headers.location).to.equal(`/project/${invite.projectId}`)
    callback()
  })
}

const expectInviteListCount = (user, projectId, count, callback) => {
  tryGetInviteList(user, projectId, (err, response, body) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(200)
    expect(body).to.have.all.keys(['invites'])
    expect(body.invites.length).to.equal(count)
    callback()
  })
}

const expectInvitesInJoinProjectCount = (user, projectId, count, callback) => {
  tryJoinProject(user, projectId, (err, response, body) => {
    expect(err).not.to.exist
    expect(response.statusCode).to.equal(200)
    expect(body.project).to.contain.keys(['invites'])
    expect(body.project.invites.length).to.equal(count)
    callback()
  })
}

const PROJECT_NAME = 'project name for sharing test'
const OWNER_NAME = 'sending user name'

describe('ProjectInviteTests', function () {
  beforeEach(function (done) {
    this.sendingUser = new User()
    this.user = new User()
    this.site_admin = new User({ email: `admin+${Math.random()}@example.com` })
    this.email = `smoketestuser+${Math.random()}@example.com`
    Async.series(
      [
        cb => this.sendingUser.login(cb),
        cb => this.sendingUser.setFeatures({ collaborators: 10 }, cb),
        cb =>
          this.sendingUser.mongoUpdate(
            {
              $set: { first_name: OWNER_NAME },
            },
            cb
          ),
        cb =>
          this.sendingUser.setFeaturesOverride(
            {
              note: 'ProjectInviteTests acceptance tests',
              features: { collaborators: 10 },
            },
            cb
          ),
      ],
      done
    )
  })

  describe('creating invites', function () {
    describe('creating two invites', function () {
      beforeEach(function (done) {
        createProject(
          this.sendingUser,
          PROJECT_NAME,
          (err, projectId, project) => {
            expect(err).not.to.exist
            this.projectId = projectId
            this.fakeProject = project
            done()
          }
        )
      })

      it('should allow the project owner to create and remove invites', function (done) {
        Async.series(
          [
            cb => expectProjectAccess(this.sendingUser, this.projectId, cb),
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 0, cb),
            // create invite, check invite list count
            cb => {
              createInvite(
                this.sendingUser,
                this.projectId,
                this.email,
                (err, invite) => {
                  if (err) {
                    return cb(err)
                  }
                  this.invite = invite
                  cb()
                }
              )
            },
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 1, cb),
            cb =>
              revokeInvite(
                this.sendingUser,
                this.projectId,
                this.invite._id,
                cb
              ),
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 0, cb),
            // and a second time
            cb => {
              createInvite(
                this.sendingUser,
                this.projectId,
                this.email,
                (err, invite) => {
                  if (err) {
                    return cb(err)
                  }
                  this.invite = invite
                  cb()
                }
              )
            },
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 1, cb),
            // check the joinProject view
            cb =>
              expectInvitesInJoinProjectCount(
                this.sendingUser,
                this.projectId,
                1,
                cb
              ),
            // revoke invite
            cb =>
              revokeInvite(
                this.sendingUser,
                this.projectId,
                this.invite._id,
                cb
              ),
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 0, cb),
            cb =>
              expectInvitesInJoinProjectCount(
                this.sendingUser,
                this.projectId,
                0,
                cb
              ),
          ],
          done
        )
      })

      it('should allow the project owner to create many invites at once', function (done) {
        Async.series(
          [
            cb => expectProjectAccess(this.sendingUser, this.projectId, cb),
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 0, cb),
            // create first invite
            cb => {
              createInvite(
                this.sendingUser,
                this.projectId,
                this.email,
                (err, invite) => {
                  if (err) {
                    return cb(err)
                  }
                  this.inviteOne = invite
                  cb()
                }
              )
            },
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 1, cb),
            // and a second
            cb => {
              createInvite(
                this.sendingUser,
                this.projectId,
                this.email,
                (err, invite) => {
                  if (err) {
                    return cb(err)
                  }
                  this.inviteTwo = invite
                  cb()
                }
              )
            },
            // should have two
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 2, cb),
            cb =>
              expectInvitesInJoinProjectCount(
                this.sendingUser,
                this.projectId,
                2,
                cb
              ),
            // revoke first
            cb =>
              revokeInvite(
                this.sendingUser,
                this.projectId,
                this.inviteOne._id,
                cb
              ),
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 1, cb),
            // revoke second
            cb =>
              revokeInvite(
                this.sendingUser,
                this.projectId,
                this.inviteTwo._id,
                cb
              ),
            cb =>
              expectInviteListCount(this.sendingUser, this.projectId, 0, cb),
          ],
          done
        )
      })
    })
  })

  describe('clicking the invite link', function () {
    beforeEach(function (done) {
      createProjectAndInvite(
        this.sendingUser,
        PROJECT_NAME,
        this.email,
        (err, project, invite, link) => {
          expect(err).not.to.exist
          this.projectId = project._id
          this.fakeProject = project
          this.invite = invite
          this.link = link
          done()
        }
      )
    })

    describe('user is logged in already', function () {
      beforeEach(function (done) {
        this.user.login(done)
      })

      describe('user is already a member of the project', function () {
        beforeEach(function (done) {
          Async.series(
            [
              cb => expectInvitePage(this.user, this.link, cb),
              cb => expectAcceptInviteAndRedirect(this.user, this.invite, cb),
              cb => expectProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })

        describe('when user clicks on the invite a second time', function () {
          it('should just redirect to the project page', function (done) {
            Async.series(
              [
                cb => expectProjectAccess(this.user, this.invite.projectId, cb),
                cb =>
                  expectInviteRedirectToProject(
                    this.user,
                    this.link,
                    this.invite,
                    cb
                  ),
                cb => expectProjectAccess(this.user, this.invite.projectId, cb),
              ],
              done
            )
          })

          describe('when the user recieves another invite to the same project', function () {
            it('should redirect to the project page', function (done) {
              Async.series(
                [
                  cb => {
                    createInvite(
                      this.sendingUser,
                      this.projectId,
                      this.email,
                      (err, invite) => {
                        if (err) {
                          throw err
                        }
                        this.secondInvite = invite
                        this.secondLink =
                          CollaboratorsEmailHandler._buildInviteUrl(
                            this.fakeProject,
                            invite
                          )
                        cb()
                      }
                    )
                  },
                  cb =>
                    expectInviteRedirectToProject(
                      this.user,
                      this.secondLink,
                      this.secondInvite,
                      cb
                    ),
                  cb =>
                    expectProjectAccess(this.user, this.invite.projectId, cb),
                  cb =>
                    revokeInvite(
                      this.sendingUser,
                      this.projectId,
                      this.secondInvite._id,
                      cb
                    ),
                ],
                done
              )
            })
          })
        })
      })

      describe('user is not a member of the project', function () {
        it('should not grant access if the user does not accept the invite', function (done) {
          Async.series(
            [
              cb => expectInvitePage(this.user, this.link, cb),
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })

        it('should render the invalid-invite page if the token is invalid', function (done) {
          Async.series(
            [
              cb => {
                const link = this.link.replace(
                  this.invite.token,
                  'not_a_real_token'
                )
                expectInvalidInvitePage(this.user, link, cb)
              },
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })

        it('should allow the user to accept the invite and access the project', function (done) {
          Async.series(
            [
              cb => expectInvitePage(this.user, this.link, cb),
              cb => expectAcceptInviteAndRedirect(this.user, this.invite, cb),
              cb => expectProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })
      })
    })

    describe('user is not logged in initially', function () {
      describe('registration prompt workflow with valid token', function () {
        before(function () {
          if (!Features.hasFeature('registration')) {
            this.skip()
          }
        })

        it('should redirect to the register page', function (done) {
          expectInviteRedirectToRegister(this.user, this.link, done)
        })

        it('should allow user to accept the invite if the user registers a new account', function (done) {
          Async.series(
            [
              cb => expectInviteRedirectToRegister(this.user, this.link, cb),
              cb =>
                expectRegistrationRedirectToInvite(this.user, this.link, cb),
              cb => expectInvitePage(this.user, this.link, cb),
              cb => expectAcceptInviteAndRedirect(this.user, this.invite, cb),
              cb => expectProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })
      })

      describe('registration prompt workflow with non-valid token', function () {
        before(function () {
          if (!Features.hasFeature('registration')) {
            this.skip()
          }
        })

        it('should redirect to the register page', function (done) {
          Async.series(
            [
              cb => expectInviteRedirectToRegister(this.user, this.link, cb),
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })

        it('should display invalid-invite right away', function (done) {
          const badLink = this.link.replace(
            this.invite.token,
            'not_a_real_token'
          )
          Async.series(
            [
              cb => expectInvalidInvitePage(this.user, badLink, cb),
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })
      })

      describe('login workflow with valid token', function () {
        beforeEach(function (done) {
          this.user.ensureUserExists(done)
        })

        it('should redirect to the register page', function (done) {
          Async.series(
            [
              cb => expectInviteRedirectToRegister(this.user, this.link, cb),
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })

        it('should allow the user to login to view the invite', function (done) {
          Async.series(
            [
              cb => expectInviteRedirectToRegister(this.user, this.link, cb),
              cb => expectLoginPage(this.user, cb),
              cb => expectLoginRedirectToInvite(this.user, this.link, cb),
              cb => expectInvitePage(this.user, this.link, cb),
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })

        it('should allow user to accept the invite if the user logs in', function (done) {
          Async.series(
            [
              cb => expectInviteRedirectToRegister(this.user, this.link, cb),
              cb => expectLoginPage(this.user, cb),
              cb => expectLoginRedirectToInvite(this.user, this.link, cb),
              cb => expectInvitePage(this.user, this.link, cb),
              cb => expectAcceptInviteAndRedirect(this.user, this.invite, cb),
              cb => expectProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })
      })

      describe('login workflow with non-valid token', function () {
        it('should redirect to the register page', function (done) {
          Async.series(
            [
              cb => expectInviteRedirectToRegister(this.user, this.link, cb),
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })

        it('should show the invalid-invite page right away', function (done) {
          const badLink = this.link.replace(
            this.invite.token,
            'not_a_real_token'
          )
          Async.series(
            [
              cb => expectInvalidInvitePage(this.user, badLink, cb),
              cb => expectNoProjectAccess(this.user, this.invite.projectId, cb),
            ],
            done
          )
        })
      })
    })
  })
})
