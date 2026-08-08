const { generateSIHPdfReport } = require('../src/lib/admin/sihPdfReport');

async function testSihPdfGeneration() {
  console.log('=== EMPIRICAL SIH PDF REPORT GENERATION TEST ===');

  const sampleData = {
    summary: {
      totalBuilders: 34,
      totalLookingForTeam: 34,
      totalTeams: 11,
      totalColleges: 8,
      highPotentialZeroTeamColleges: 1,
    },
    collegeStats: [
      {
        collegeName: "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)",
        builderCount: 16,
        lookingForTeamCount: 16,
        teamCount: 6,
        totalTeamMembers: 15,
        avgTeamSize: "2.5",
        isHighPotentialZeroTeams: false,
        builders: [],
        teams: [
          { name: "MERNCrusher", team_members: [{ profiles: { full_name: "Yash Shah" } }] },
          { name: "2Slow4Bugs", team_members: [{ profiles: { full_name: "Yug" } }] },
        ],
      },
      {
        collegeName: "COEP Technological University, Pune",
        builderCount: 8,
        lookingForTeamCount: 8,
        teamCount: 3,
        totalTeamMembers: 4,
        avgTeamSize: "1.3",
        isHighPotentialZeroTeams: false,
        builders: [],
        teams: [{ name: "Encoders", team_members: [] }],
      },
      {
        collegeName: "SPIT Mumbai (Sardar Patel Institute of Technology)",
        builderCount: 5,
        lookingForTeamCount: 5,
        teamCount: 0,
        totalTeamMembers: 0,
        avgTeamSize: "0.0",
        isHighPotentialZeroTeams: true,
        builders: [],
        teams: [],
      },
    ],
  };

  const buffer = generateSIHPdfReport(sampleData);
  console.log(`✅ Generated SIH Telemetry PDF Buffer: ${buffer.length} bytes`);

  if (!buffer || buffer.length < 1000) {
    throw new Error('PDF generation failed or buffer too small');
  }

  console.log('✅ EMPIRICAL TEST PASSED: SIH Telemetry PDF Report generated cleanly!');
}

testSihPdfGeneration().catch(err => {
  console.error(err);
  process.exit(1);
});
