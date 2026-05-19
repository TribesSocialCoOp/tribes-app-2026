/**
 * Seed script: Ensures the NSFW proposal has 3 options and realistic test votes.
 * 
 * Usage: node scripts/seed-ternary-options.mjs
 */
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://tribes:tribes_dev@127.0.0.1:5432/tribes',
});

async function main() {
  const client = await pool.connect();
  try {
    // 1. Find the NSFW proposal
    const { rows: proposalRows } = await client.query(
      `SELECT id, title, vote_count FROM proposals WHERE title ILIKE '%nsfw%' ORDER BY created_at DESC LIMIT 1`
    );
    if (proposalRows.length === 0) {
      console.error('❌ No NSFW proposal found. Please create one first.');
      process.exit(1);
    }
    const proposal = proposalRows[0];
    console.log(`✅ Found proposal: "${proposal.title}" (id: ${proposal.id}, votes: ${proposal.vote_count})`);

    // 2. Check existing options
    const { rows: existingOptions } = await client.query(
      `SELECT id, label, vote_count, sort_order FROM proposal_options WHERE proposal_id = $1 ORDER BY sort_order`,
      [proposal.id]
    );
    console.log(`   Current options (${existingOptions.length}):`);
    existingOptions.forEach(o => console.log(`     [${o.sort_order}] "${o.label}" — ${o.vote_count} votes`));

    // 3. If only 2 options, add the third "Send back" option
    let reviseOption;
    const reviseLabel = 'Send back to Founders for revision based on our Discussion';
    
    const existing3 = existingOptions.find(o => 
      o.label.toLowerCase().includes('send back') || o.label.toLowerCase().includes('revise')
    );

    if (existing3) {
      reviseOption = existing3;
      console.log(`   ℹ️  Third option already exists: "${reviseOption.label}"`);
    } else {
      const newId = crypto.randomUUID();
      await client.query(
        `INSERT INTO proposal_options (id, proposal_id, label, vote_count, sort_order) VALUES ($1, $2, $3, 0, 2)`,
        [newId, proposal.id, reviseLabel]
      );
      reviseOption = { id: newId, label: reviseLabel, vote_count: 0 };
      console.log(`   ✅ Added third option: "${reviseLabel}"`);
    }

    // 4. Get all 3 options now
    const { rows: allOptions } = await client.query(
      `SELECT id, label, vote_count, sort_order FROM proposal_options WHERE proposal_id = $1 ORDER BY sort_order`,
      [proposal.id]
    );
    console.log(`\n   Options after update (${allOptions.length}):`);
    allOptions.forEach(o => console.log(`     [${o.sort_order}] "${o.label}" — ${o.vote_count} votes`));

    // 5. Get some user IDs to cast test votes (grab users who haven't voted)
    const { rows: voters } = await client.query(
      `SELECT u.id FROM users u 
       WHERE u.id NOT IN (SELECT user_id FROM votes WHERE proposal_id = $1)
       LIMIT 6`,
      [proposal.id]
    );
    console.log(`\n   Available voters who haven't voted: ${voters.length}`);

    if (voters.length === 0) {
      console.log('   ℹ️  No additional voters available. Checking current vote distribution...');
    } else {
      // Distribute votes: ~2 support, ~2 revise, ~1 oppose (realistic distribution)
      const supportOpt = allOptions.find(o => o.label.toLowerCase().includes('adopt') || o.label.toLowerCase().includes('yes') || o.label.toLowerCase().includes('support') || o.label.toLowerCase().includes('allow') || o.label.toLowerCase().includes('approve'));
      const opposeOpt = allOptions.find(o => o.label.toLowerCase().includes('reject') || o.label.toLowerCase().includes('no') || o.label.toLowerCase().includes('oppose') || o.label.toLowerCase().includes('restrict') || o.label.toLowerCase().includes('ban'));
      const revOpt = allOptions.find(o => o.label.toLowerCase().includes('send back') || o.label.toLowerCase().includes('revise'));

      if (!supportOpt || !opposeOpt || !revOpt) {
        console.error('❌ Could not identify all three options by keyword. Options:', allOptions.map(o => o.label));
        process.exit(1);
      }

      // Vote distribution plan
      const voteDistribution = [
        { userId: voters[0]?.id, optionId: supportOpt.id, label: 'support' },
        { userId: voters[1]?.id, optionId: supportOpt.id, label: 'support' },
        { userId: voters[2]?.id, optionId: revOpt.id, label: 'revise' },
        { userId: voters[3]?.id, optionId: revOpt.id, label: 'revise' },
        { userId: voters[4]?.id, optionId: revOpt.id, label: 'revise' },
        { userId: voters[5]?.id, optionId: opposeOpt.id, label: 'oppose' },
      ].filter(v => v.userId); // Skip if not enough voters

      console.log(`   Casting ${voteDistribution.length} new votes...`);

      for (const vote of voteDistribution) {
        const voteId = crypto.randomUUID();
        try {
          await client.query(
            `INSERT INTO votes (id, proposal_id, option_id, user_id, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [voteId, proposal.id, vote.optionId, vote.userId]
          );
          // Increment option vote_count
          await client.query(
            `UPDATE proposal_options SET vote_count = vote_count + 1 WHERE id = $1`,
            [vote.optionId]
          );
          // Increment proposal vote_count
          await client.query(
            `UPDATE proposals SET vote_count = vote_count + 1 WHERE id = $1`,
            [proposal.id]
          );
          console.log(`     ✅ Vote cast: ${vote.label} by ${vote.userId.slice(0, 8)}...`);
        } catch (err) {
          if (err.code === '23505') {
            console.log(`     ⚠️  User ${vote.userId.slice(0, 8)}... already voted (skipping)`);
          } else {
            throw err;
          }
        }
      }
    }

    // 6. Print final state
    const { rows: finalOptions } = await client.query(
      `SELECT id, label, vote_count, sort_order FROM proposal_options WHERE proposal_id = $1 ORDER BY sort_order`,
      [proposal.id]
    );
    const { rows: [finalProposal] } = await client.query(
      `SELECT vote_count FROM proposals WHERE id = $1`,
      [proposal.id]
    );
    
    console.log(`\n🎯 Final state for "${proposal.title}":`);
    console.log(`   Total votes: ${finalProposal.vote_count}`);
    finalOptions.forEach(o => {
      const pct = finalProposal.vote_count > 0 ? Math.round((o.vote_count / finalProposal.vote_count) * 100) : 0;
      console.log(`   [${o.sort_order}] "${o.label}" — ${o.vote_count} votes (${pct}%)`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
