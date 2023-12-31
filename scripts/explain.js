// Description:
//    A place to get initial explanation of products or concepts
//    at Canonical based on a Google spreadsheet.
// Dependencies:
//   google-spreadsheet: ""
//
// Configuration:
//   set HUBOT_SPREADSHEET_ID in environment
//   set HUBOT_SPREADSHEET_CLIENT_EMAIL in environment
//   set HUBOT_SPREADSHEET_PRIVATE_KEY in environment
//   set MATTERMOST_TOKEN_CMD_EXPLAIN in environment
//
// Commands:
//   hubot explain <product|concept>: explains the concepts and provides reading resources
//
// URLS:
//   POST /hubot/explain
//     Follows format suggested here: https://docs.mattermost.com/developer/slash-commands.html
//     data:
//       token: Should be similar than MATTERMOST_TOKEN_CMD_ACRONYM
//       text: explain
//     response:
//       {"response_type": "ephemeral", "text": TEXT_POSTED}
//
// Note:
//   The format of the spreadsheet should be:
//
// | Explain | Definition                        | PM          | Contact | Link            |
// | ------- | --------------------------------- | ----------- | ------- | --------------- |
// | MAAS    | MAAS is a fast provisioning tool. | Anton Smith | ~MAAS   | https://maas.io |
//
// Authors:
//   amylily1011, goulinkh, toto

const { GoogleSpreadsheet } = require("google-spreadsheet");
const { requiredEnvs } = require("./utils");

const {
  HUBOT_SPREADSHEET_ID,
  HUBOT_SPREADSHEET_CLIENT_EMAIL,
  HUBOT_SPREADSHEET_PRIVATE_KEY,
  MATTERMOST_TOKEN_CMD_EXPLAIN,
} = process.env;
const HTTPS_PROXY = process.env.HTTPS_PROXY;

requiredEnvs({
  HUBOT_SPREADSHEET_ID,
  HUBOT_SPREADSHEET_CLIENT_EMAIL,
  HUBOT_SPREADSHEET_PRIVATE_KEY,
  MATTERMOST_TOKEN_CMD_EXPLAIN,
});

const usage = `Format: \`/explain <concept>\` eg. \`/explain MAAS\`. Add your own [here](https://docs.google.com/spreadsheets/d/1nNk4typDnOfDEYRzlEjtd58zk-aOd3_NNp6eufthZHM/edit#gid=2064544629)`;

const googleServiceCreds = {
  client_email: HUBOT_SPREADSHEET_CLIENT_EMAIL,
  private_key: HUBOT_SPREADSHEET_PRIVATE_KEY,
};
const doc = new GoogleSpreadsheet(HUBOT_SPREADSHEET_ID);

if (HTTPS_PROXY) {
  doc.axios.defaults.proxy = false;
  const HttpsProxyAgent = require("https-proxy-agent");
  doc.axios.defaults.httpsAgent = new HttpsProxyAgent(HTTPS_PROXY);
}

const sanitizeValue = (value) => value.replace(/[\r\n]/, "").trim();
const valueIsEmpty = (value) =>
  !value || value.toLocaleLowerCase().trim() === "n/a";
const formatRowToMDTable = (row) => {
  let mdTable = `| Title | Description |\n|--|--|\n`;
  const rows = [];
  rows.push([row.Explain, row.Definition]);
  if (!valueIsEmpty(row.PM)) rows.push(["PM", row.PM]);
  if (!valueIsEmpty(row.Team)) rows.push(["Team", row.Team]);
  if (!valueIsEmpty(row.Contact)) rows.push(["Contact channel", row.Contact]);
  if (!valueIsEmpty(row.Link)) rows.push(["Read more", row.Link]);
  mdTable += rows
    .map((row) => `| ${sanitizeValue(row[0])} | ${sanitizeValue(row[1])} |`)
    .join("\n");
  return mdTable;
};

/**
 * A place to get initial explanation of products or concepts
 * at Canonical based on a Google spreadsheet.
 * @param {string} explainQuery a product or concept that needs explanation
 * @returns string
 */
async function fetchExplanation(explainQuery) {
  await doc.useServiceAccountAuth(googleServiceCreds);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Explain"];
  if (explainQuery.toLowerCase().trim() == "why") {
    // Get a random row from the "why" sheet
    const why = doc.sheetsByTitle["Why"];
    const rows = await why.getRows();
    const randomRowIndex = parseInt(
      Math.floor(Math.random() * (rows.length + 1))
    );
    const whyRandomRow = rows.find((row) => row.rowIndex == randomRowIndex);
    const display_text = whyRandomRow.why;
    return display_text;
  } else {
    const rows = await sheet.getRows();

    const row = rows.find((row) => {
      row = row || {};
      const searchQuery = explainQuery.toLocaleLowerCase().trim();
      const explain = row.Explain || "";
      const alias = row.Alias || "";
      return (
        explain.toLowerCase().trim() === searchQuery ||
        alias
          .toLowerCase()
          .trim()
          .split(",")
          .map((e) => e.trim().toLocaleLowerCase())
          .find((keyword) => keyword == searchQuery)
      );
    });
    if (!row) return usage;
    return formatRowToMDTable(row);
  }
}

module.exports = function (robot) {
  robot.respond(/explain (.*)/, async function (res) {
    const explainQuery = res.match[1];
    res.send(await fetchExplanation(explainQuery));
  });

  robot.router.post("/hubot/explain", async function (req, res) {
    if (MATTERMOST_TOKEN_CMD_EXPLAIN != req.body.token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const explainQuery = req.body.text;
    if (!explainQuery || explainQuery.trim().match(/^(-)*h(elp)?$/gi)) {
      return res.json({ response_type: "ephemeral", text: usage });
    }
    robot.logger.info(": " + explainQuery);
    result = await fetchExplanation(explainQuery);
    return res.json({ response_type: "ephemeral", text: result });
  });
};
