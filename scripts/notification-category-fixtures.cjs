// Synthetic shared regression data, never production rows.
const examples = [
  ['Ava sent you a connection request: Looking for a compatible teammate', 'connections', 'Connection', 'info'],
  ['Ava sent you a connection request: Let us discuss team formation', 'connections', 'Connection', 'info'],
  ['Ava sent you a connection request: I was invited to join a team at a hackathon', 'connections', 'Connection', 'info'],
  ['Your connection request was accepted', 'connections', 'Connection', 'info'],
  ['TEAM BUILDERS accepted your connection request', 'connections', 'Connection', 'info'],
  ['You have been invited to join Kernel Builders', 'teams', 'Invite', 'accent'],
  ['You have been invited to join Connection Labs', 'teams', 'Invite', 'accent'],
  ['You have been invited to join Accepted Your Connection Request', 'teams', 'Invite', 'accent'],
  ['You joined Your Connection Request Was Accepted', 'teams', 'Team', 'ok'],
  ['New join request for Sent You A Connection Request', 'teams', 'Team', 'ok'],
  ['You joined Kernel Builders', 'teams', 'Team', 'ok'],
  ['Ava joined your team', 'teams', 'Team', 'ok'],
  ['New join request for Kernel Builders', 'teams', 'Team', 'ok'],
  ['Your team request was accepted', 'teams', 'Team', 'ok'],
  ['You have been promoted to owner of team "Kernel Builders" because the previous owner left.', 'teams', 'Team', 'ok'],
  ['You were removed from the team', 'teams', 'Team', 'ok'],
  ['Ava assigned you to task "Build" in team "Kernel Builders"', 'teams', 'Team', 'ok'],
  ['Service maintenance is complete', 'other', 'Activity', 'neutral'],
  ['Read these team formation tips for finding teammates', 'other', 'Activity', 'neutral'],
  ['Reconnect to the network after maintenance', 'other', 'Activity', 'neutral'],
  ['An invitation to a community talk is available', 'other', 'Activity', 'neutral'],
  ['Hackathon deadline changed', 'other', 'Hackathon', 'hack'],
  ['You were mentioned in a chat', 'other', 'Mention', 'proj'],
];
const rows = () => examples.map(([message, category, label, tone], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  message, category, label, tone, is_read: index % 3 === 0,
  created_at: new Date(Date.now() - index * 60000).toISOString(),
  link: category === 'connections' ? '/connections' : category === 'teams' ? '/teams/00000000-0000-4000-8000-000000000099' : null,
}));
module.exports = { examples, rows };
