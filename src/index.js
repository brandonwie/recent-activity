/**
 * Copyright (c) 2020 James George
 * Copyright (c) 2021 The Readme-Workflows organisation and Contributors
 */

const fs = require("fs");
const { Toolkit } = require("actions-toolkit");

// configuration
const { username, readme_file, max_lines } = require("./config");

// functions
const appendDate = require("./functions/appendDate");
const commitFile = require("./functions/commitFile");
const filterContent = require("./functions/filterContent");

// accepted events
const serializers = require("./serializers");

Toolkit.run(
  async (tools) => {
    // Get the user's public events
    tools.log.debug(`Getting activity for ${username}`);
    const events = await tools.github.activity.listPublicEventsForUser({
      username: username,
      per_page: 100,
    });
    tools.log.debug(`${events.data.length} events found for ${username}.`);

    let eventData = events.data
      // Filter out any boring activity
      .filter((event) => serializers.hasOwnProperty(event.type));

    let content = filterContent(eventData);

    let readmeContent;
    tools.log.info("DOES THIS LOG EVER WORK??????");
    try {
      readmeContent = fs.readFileSync(readme_file, "utf-8").split("\n");
    } catch (err) {
      return tools.exit.failure(`Couldn't find the file named ${readme_file}`);
    }

    // Find the index corresponding to <!--RECENT_ACTIVITY:start--> comment
    let startIdx = readmeContent.findIndex(
      (content) => content.trim() === "<!--RECENT_ACTIVITY:start-->"
    );

    // Early return in case the <!--RECENT_ACTIVITY:start--> comment was not found
    if (startIdx === -1) {
      return tools.exit.failure(
        "Couldn't find the <!--RECENT_ACTIVITY:start--> comment. Exiting!"
      );
    }

    // Find the index corresponding to <!--RECENT_ACTIVITY:end--> comment
    const endIdx = readmeContent.findIndex(
      (content) => content.trim() === "<!--RECENT_ACTIVITY:end-->"
    );

    if (!content.length) {
      tools.exit.success("No events found. Leaving readme unchanged.");
    }

    if (content.length < max_lines) {
      tools.log.info(`Found less than ${max_lines} activities`);
    }

    if (startIdx !== -1 && endIdx === -1) {
      tools.log.info("startIdx and endIdx are found");
      // Add one since the content needs to be inserted just after the initial comment
      startIdx++;
      content.forEach((line, idx) =>
        readmeContent.splice(startIdx + idx, 0, `${idx + 1}. ${line}`)
      );

      // Append <!--RECENT_ACTIVITY:end--> comment
      readmeContent.splice(
        startIdx + content.length,
        0,
        "<!--RECENT_ACTIVITY:end-->"
      );

      readmeContent = appendDate(readmeContent);
      tools.log.info("readmeContent", readmeContent);

      // Update README
      fs.writeFileSync(readme_file, readmeContent.join("\n"));

      // Commit to the remote repository
      try {
        tools.log.info("Enter try block to commit file");
        await commitFile();
      } catch (err) {
        tools.log.debug("Something went wrong");
        return tools.exit.failure(err);
      }
      tools.exit.success("Wrote to README");
    }

    // const oldContent = readmeContent.slice(startIdx + 1, endIdx).join("\n");
    // const newContent = content
    //   .map((line, idx) => `${idx + 1}. ${line}`)
    //   .join("\n");

    // // if (oldContent.trim() === newContent.trim())
    // //   tools.exit.success("No changes detected.");

    startIdx++;

    // Recent GitHub Activity content between the comments
    const readmeActivitySection = readmeContent.slice(startIdx, endIdx);
    if (!readmeActivitySection.length) {
      content.some((line, idx) => {
        // User doesn't have 5 public events
        if (!line) {
          return true;
        }
        readmeContent.splice(startIdx + idx, 0, `${idx + 1}. ${line}`);
      });
      tools.log.success("Wrote to README");
    } else {
      // It is likely that a newline is inserted after the <!--RECENT_ACTIVITY:start--> comment (code formatter)
      let count = 0;

      readmeActivitySection.some((line, idx) => {
        // User doesn't have 5 public events
        if (!content[count]) {
          return true;
        }
        if (line !== "") {
          readmeContent[startIdx + idx] = `${count + 1}. ${content[count]}`;
          count++;
        }
      });
      tools.log.success("Updated README with the recent activity");
    }

    readmeContent = appendDate(readmeContent);

    // Update README
    fs.writeFileSync(readme_file, readmeContent.join("\n"));

    // Commit to the remote repository
    try {
      await commitFile();
    } catch (err) {
      tools.log.debug("Something went wrong");
      return tools.exit.failure(err);
    }
    tools.exit.success("Pushed to remote repository");
  },
  {
    event: ["schedule", "workflow_dispatch"],
    secrets: ["GITHUB_TOKEN"],
  }
);
