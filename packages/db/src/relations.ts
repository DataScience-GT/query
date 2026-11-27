import { defineRelations } from "drizzle-orm";

import * as schema from "./schemas";

export const relations = defineRelations(schema, (r) => ({
  admins: {
    user: r.one.users({
      from: r.admins.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  events: {
    createdBy: r.one.users({
      from: r.events.createdById,
      to: r.users.id,
      optional: false,
    }),
    checkIns: r.many.eventCheckIns({
      from: r.events.id,
      to: r.eventCheckIns.eventId,
    }),
  },
  eventCheckIns: {
    event: r.one.events({
      from: r.eventCheckIns.eventId,
      to: r.events.id,
      optional: false,
    }),
    user: r.one.users({
      from: r.eventCheckIns.userId,
      to: r.users.id,
      optional: false,
    }),
    member: r.one.members({ from: r.eventCheckIns.memberId, to: r.members.id }),
  },
  hackathons: {
    participants: r.many.hackathonParticipants({
      from: r.hackathons.id,
      to: r.hackathonParticipants.hackathonId,
    }),
    teams: r.many.hackathonTeams({
      from: r.hackathons.id,
      to: r.hackathonTeams.hackathonId,
    }),
    projects: r.many.hackathonProjects({
      from: r.hackathons.id,
      to: r.hackathonProjects.hackathonId,
    }),
    interest: r.many.hackathonInterest({
      from: r.hackathons.id,
      to: r.hackathonInterest.hackathonId,
    }),
  },
  hackathonInterest: {
    hackathon: r.one.hackathons({
      from: r.hackathonInterest.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    user: r.one.users({
      from: r.hackathonInterest.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  hackathonParticipants: {
    hackathon: r.one.hackathons({
      from: r.hackathonParticipants.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    user: r.one.users({
      from: r.hackathonParticipants.userId,
      to: r.users.id,
      optional: false,
    }),
    member: r.one.members({
      from: r.hackathonParticipants.memberId,
      to: r.members.id,
    }),
    team: r.one.hackathonTeams({
      from: r.hackathonParticipants.teamId,
      to: r.hackathonTeams.id,
    }),
  },
  hackathonTeams: {
    hackathon: r.one.hackathons({
      from: r.hackathonTeams.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    captain: r.one.users({
      from: r.hackathonTeams.captainId,
      to: r.users.id,
      optional: false,
    }),
    participants: r.many.hackathonParticipants({
      from: r.hackathonTeams.id,
      to: r.hackathonParticipants.teamId,
    }),
    projects: r.many.hackathonProjects({
      from: r.hackathonTeams.id,
      to: r.hackathonProjects.teamId,
    }),
  },
  hackathonEvents: {
    hackathon: r.one.hackathons({
      from: r.hackathonEvents.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    attendees: r.many.hackathonEventAttendees({
      from: r.hackathonEvents.id,
      to: r.hackathonEventAttendees.eventId,
    }),
  },
  hackathonEventAttendees: {
    event: r.one.hackathonEvents({
      from: r.hackathonEventAttendees.eventId,
      to: r.hackathonEvents.id,
      optional: false,
    }),
    participant: r.one.hackathonParticipants({
      from: r.hackathonEventAttendees.participantId,
      to: r.hackathonParticipants.id,
      optional: false,
    }),
  },
  hackathonProjects: {
    hackathon: r.one.hackathons({
      from: r.hackathonProjects.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    team: r.one.hackathonTeams({
      from: r.hackathonProjects.teamId,
      to: r.hackathonTeams.id,
    }),
  },
  hackathonAnnouncements: {
    hackathon: r.one.hackathons({
      from: r.hackathonAnnouncements.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    recipients: r.many.hackathonAnnouncementRecipients({
      from: r.hackathonAnnouncements.id,
      to: r.hackathonAnnouncementRecipients.announcementId,
    }),
  },
  hackathonAnnouncementRecipients: {
    announcement: r.one.hackathonAnnouncements({
      from: r.hackathonAnnouncementRecipients.announcementId,
      to: r.hackathonAnnouncements.id,
      optional: false,
    }),
  },
  projectLeaders: {
    user: r.one.users({
      from: r.projectLeaders.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  initiatives: {
    leader: r.one.users({
      from: r.initiatives.leaderUserId,
      to: r.users.id,
      optional: false,
    }),
    applications: r.many.initiativeApplications({
      from: r.initiatives.id,
      to: r.initiativeApplications.initiativeId,
    }),
  },
  initiativeApplications: {
    initiative: r.one.initiatives({
      from: r.initiativeApplications.initiativeId,
      to: r.initiatives.id,
      optional: false,
    }),
    user: r.one.users({
      from: r.initiativeApplications.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  judges: {
    user: r.one.users({
      from: r.judges.userId,
      to: r.users.id,
      optional: false,
    }),
    hackathon: r.one.hackathons({
      from: r.judges.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    assignments: r.many.judgeAssignments({
      from: r.judges.id,
      to: r.judgeAssignments.judgeId,
    }),
    votes: r.many.judgeVotes({ from: r.judges.id, to: r.judgeVotes.judgeId }),
  },
  judgeAssignments: {
    judge: r.one.judges({
      from: r.judgeAssignments.judgeId,
      to: r.judges.id,
      optional: false,
    }),
    hackathon: r.one.hackathons({
      from: r.judgeAssignments.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
  },
  judgingProjects: {
    hackathon: r.one.hackathons({
      from: r.judgingProjects.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    votes: r.many.judgeVotes({
      from: r.judgingProjects.id,
      to: r.judgeVotes.projectId,
    }),
  },
  judgeVotes: {
    judge: r.one.judges({
      from: r.judgeVotes.judgeId,
      to: r.judges.id,
      optional: false,
    }),
    project: r.one.judgingProjects({
      from: r.judgeVotes.projectId,
      to: r.judgingProjects.id,
      optional: false,
    }),
  },
  hackathonResults: {
    hackathon: r.one.hackathons({
      from: r.hackathonResults.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    project: r.one.judgingProjects({
      from: r.hackathonResults.projectId,
      to: r.judgingProjects.id,
      optional: false,
    }),
    sourceProject: r.one.hackathonProjects({
      from: r.hackathonResults.sourceProjectId,
      to: r.hackathonProjects.id,
    }),
  },
  judgingEntries: {
    hackathon: r.one.hackathons({
      from: r.judgingEntries.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
    sourceProject: r.one.hackathonProjects({
      from: r.judgingEntries.sourceProjectId,
      to: r.hackathonProjects.id,
    }),
    members: r.many.judgingEntryMembers({
      from: r.judgingEntries.id,
      to: r.judgingEntryMembers.entryId,
    }),
    challenges: r.many.judgingEntryChallenges({
      from: r.judgingEntries.id,
      to: r.judgingEntryChallenges.entryId,
    }),
    appointments: r.many.judgingAppointments({
      from: r.judgingEntries.id,
      to: r.judgingAppointments.entryId,
    }),
    evaluations: r.many.judgingEvaluations({
      from: r.judgingEntries.id,
      to: r.judgingEvaluations.entryId,
    }),
  },
  judgingEntryMembers: {
    entry: r.one.judgingEntries({
      from: r.judgingEntryMembers.entryId,
      to: r.judgingEntries.id,
      optional: false,
    }),
    user: r.one.users({ from: r.judgingEntryMembers.userId, to: r.users.id }),
    claimLink: r.one.judgingClaimLinks({
      from: r.judgingEntryMembers.id,
      to: r.judgingClaimLinks.memberId,
      optional: false,
    }),
  },
  judgingClaimLinks: {
    member: r.one.judgingEntryMembers({
      from: r.judgingClaimLinks.memberId,
      to: r.judgingEntryMembers.id,
      optional: false,
    }),
  },
  judgingChallenges: {
    parent: r.one.judgingChallenges({
      from: r.judgingChallenges.parentId,
      to: r.judgingChallenges.id,
      alias: "judging_challenge_parent",
    }),
    children: r.many.judgingChallenges({
      from: r.judgingChallenges.id,
      to: r.judgingChallenges.parentId,
      alias: "judging_challenge_parent",
    }),
    entries: r.many.judgingEntryChallenges({
      from: r.judgingChallenges.id,
      to: r.judgingEntryChallenges.challengeId,
    }),
    rooms: r.many.judgingRooms({
      from: r.judgingChallenges.id,
      to: r.judgingRooms.challengeId,
    }),
  },
  judgingEntryChallenges: {
    entry: r.one.judgingEntries({
      from: r.judgingEntryChallenges.entryId,
      to: r.judgingEntries.id,
      optional: false,
    }),
    challenge: r.one.judgingChallenges({
      from: r.judgingEntryChallenges.challengeId,
      to: r.judgingChallenges.id,
      optional: false,
    }),
  },
  judgingBuildings: {
    rooms: r.many.judgingRooms({
      from: r.judgingBuildings.id,
      to: r.judgingRooms.buildingId,
    }),
  },
  judgingRooms: {
    challenge: r.one.judgingChallenges({
      from: r.judgingRooms.challengeId,
      to: r.judgingChallenges.id,
      optional: false,
    }),
    building: r.one.judgingBuildings({
      from: r.judgingRooms.buildingId,
      to: r.judgingBuildings.id,
    }),
    links: r.many.judgingRoomLinks({
      from: r.judgingRooms.id,
      to: r.judgingRoomLinks.roomId,
    }),
    presence: r.many.judgingPresence({
      from: r.judgingRooms.id,
      to: r.judgingPresence.roomId,
    }),
    appointments: r.many.judgingAppointments({
      from: r.judgingRooms.id,
      to: r.judgingAppointments.roomId,
    }),
  },
  judgingRoomLinks: {
    room: r.one.judgingRooms({
      from: r.judgingRoomLinks.roomId,
      to: r.judgingRooms.id,
      optional: false,
    }),
  },
  judgingJudges: {
    user: r.one.users({ from: r.judgingJudges.userId, to: r.users.id }),
    presence: r.many.judgingPresence({
      from: r.judgingJudges.id,
      to: r.judgingPresence.judgeId,
    }),
    evaluations: r.many.judgingEvaluations({
      from: r.judgingJudges.id,
      to: r.judgingEvaluations.judgeId,
    }),
  },
  judgingGuestSessions: {
    link: r.one.judgingRoomLinks({
      from: r.judgingGuestSessions.linkId,
      to: r.judgingRoomLinks.id,
      optional: false,
    }),
    room: r.one.judgingRooms({
      from: r.judgingGuestSessions.roomId,
      to: r.judgingRooms.id,
      optional: false,
    }),
    judge: r.one.judgingJudges({
      from: r.judgingGuestSessions.judgeId,
      to: r.judgingJudges.id,
    }),
  },
  judgingPresence: {
    judge: r.one.judgingJudges({
      from: r.judgingPresence.judgeId,
      to: r.judgingJudges.id,
      optional: false,
    }),
    room: r.one.judgingRooms({
      from: r.judgingPresence.roomId,
      to: r.judgingRooms.id,
      optional: false,
    }),
  },
  judgingSchedules: {
    appointments: r.many.judgingAppointments({
      from: r.judgingSchedules.id,
      to: r.judgingAppointments.scheduleId,
    }),
  },
  judgingAppointments: {
    schedule: r.one.judgingSchedules({
      from: r.judgingAppointments.scheduleId,
      to: r.judgingSchedules.id,
      optional: false,
    }),
    entry: r.one.judgingEntries({
      from: r.judgingAppointments.entryId,
      to: r.judgingEntries.id,
      optional: false,
    }),
    challenge: r.one.judgingChallenges({
      from: r.judgingAppointments.challengeId,
      to: r.judgingChallenges.id,
      optional: false,
    }),
    room: r.one.judgingRooms({
      from: r.judgingAppointments.roomId,
      to: r.judgingRooms.id,
      optional: false,
    }),
  },
  judgingEvaluations: {
    judge: r.one.judgingJudges({
      from: r.judgingEvaluations.judgeId,
      to: r.judgingJudges.id,
      optional: false,
    }),
    entry: r.one.judgingEntries({
      from: r.judgingEvaluations.entryId,
      to: r.judgingEntries.id,
      optional: false,
    }),
    challenge: r.one.judgingChallenges({
      from: r.judgingEvaluations.challengeId,
      to: r.judgingChallenges.id,
      optional: false,
    }),
    appointment: r.one.judgingAppointments({
      from: r.judgingEvaluations.appointmentId,
      to: r.judgingAppointments.id,
    }),
    ratings: r.many.judgingEvaluationRatings({
      from: r.judgingEvaluations.id,
      to: r.judgingEvaluationRatings.evaluationId,
    }),
    responses: r.many.judgingEvaluationResponses({
      from: r.judgingEvaluations.id,
      to: r.judgingEvaluationResponses.evaluationId,
    }),
    revisions: r.many.judgingEvaluationRevisions({
      from: r.judgingEvaluations.id,
      to: r.judgingEvaluationRevisions.evaluationId,
    }),
  },
  judgingEvaluationRatings: {
    evaluation: r.one.judgingEvaluations({
      from: r.judgingEvaluationRatings.evaluationId,
      to: r.judgingEvaluations.id,
      optional: false,
    }),
    item: r.one.judgingRubricItems({
      from: r.judgingEvaluationRatings.itemId,
      to: r.judgingRubricItems.id,
      optional: false,
    }),
  },
  judgingEvaluationResponses: {
    evaluation: r.one.judgingEvaluations({
      from: r.judgingEvaluationResponses.evaluationId,
      to: r.judgingEvaluations.id,
      optional: false,
    }),
    item: r.one.judgingRubricItems({
      from: r.judgingEvaluationResponses.itemId,
      to: r.judgingRubricItems.id,
      optional: false,
    }),
  },
  judgingEvaluationRevisions: {
    evaluation: r.one.judgingEvaluations({
      from: r.judgingEvaluationRevisions.evaluationId,
      to: r.judgingEvaluations.id,
      optional: false,
    }),
  },
  judgingDeliberationSections: {
    entries: r.many.judgingDeliberationEntries({
      from: r.judgingDeliberationSections.id,
      to: r.judgingDeliberationEntries.sectionId,
    }),
  },
  judgingDeliberationEntries: {
    section: r.one.judgingDeliberationSections({
      from: r.judgingDeliberationEntries.sectionId,
      to: r.judgingDeliberationSections.id,
      optional: false,
    }),
    entry: r.one.judgingEntries({
      from: r.judgingDeliberationEntries.entryId,
      to: r.judgingEntries.id,
      optional: false,
    }),
  },
  judgingPlacements: {
    entry: r.one.judgingEntries({
      from: r.judgingPlacements.entryId,
      to: r.judgingEntries.id,
      optional: false,
    }),
  },
  users: {
    profile: r.one.userProfiles({
      from: r.users.id,
      to: r.userProfiles.userId,
      optional: false,
    }),
    member: r.one.members({
      from: r.users.id,
      to: r.members.userId,
      optional: false,
    }),
  },
  userProfiles: {
    user: r.one.users({
      from: r.userProfiles.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  members: {
    user: r.one.users({
      from: r.members.userId,
      to: r.users.id,
      optional: false,
    }),
    membershipHistory: r.many.membershipHistory({
      from: r.members.id,
      to: r.membershipHistory.memberId,
    }),
  },
  membershipHistory: {
    member: r.one.members({
      from: r.membershipHistory.memberId,
      to: r.members.id,
      optional: false,
    }),
  },
  hackathonPointAdjustments: {
    participant: r.one.hackathonParticipants({
      from: r.hackathonPointAdjustments.participantId,
      to: r.hackathonParticipants.id,
      optional: false,
    }),
    actor: r.one.users({
      from: r.hackathonPointAdjustments.actorId,
      to: r.users.id,
    }),
  },
  hackathonStoreItems: {
    purchases: r.many.hackathonStorePurchases({
      from: r.hackathonStoreItems.id,
      to: r.hackathonStorePurchases.itemId,
    }),
  },
  hackathonStorePurchases: {
    participant: r.one.hackathonParticipants({
      from: r.hackathonStorePurchases.participantId,
      to: r.hackathonParticipants.id,
    }),
    item: r.one.hackathonStoreItems({
      from: r.hackathonStorePurchases.itemId,
      to: r.hackathonStoreItems.id,
    }),
  },
  stripePayments: {
    linkedUser: r.one.users({
      from: r.stripePayments.linkedUserId,
      to: r.users.id,
    }),
    accountLinks: r.many.userAccountLinks({
      from: r.stripePayments.id,
      to: r.userAccountLinks.stripePaymentId,
    }),
  },
  userAccountLinks: {
    user: r.one.users({
      from: r.userAccountLinks.userId,
      to: r.users.id,
      optional: false,
    }),
    stripePayment: r.one.stripePayments({
      from: r.userAccountLinks.stripePaymentId,
      to: r.stripePayments.id,
      optional: false,
    }),
  },
  subteams: {
    applications: r.many.subteamApplications({
      from: r.subteams.id,
      to: r.subteamApplications.subteamId,
    }),
  },
  subteamApplications: {
    subteam: r.one.subteams({
      from: r.subteamApplications.subteamId,
      to: r.subteams.id,
      optional: false,
    }),
    user: r.one.users({
      from: r.subteamApplications.userId,
      to: r.users.id,
      optional: false,
    }),
  },
  hackathonVolunteerApplications: {
    user: r.one.users({
      from: r.hackathonVolunteerApplications.userId,
      to: r.users.id,
      optional: false,
    }),
    hackathon: r.one.hackathons({
      from: r.hackathonVolunteerApplications.hackathonId,
      to: r.hackathons.id,
      optional: false,
    }),
  },
}));
