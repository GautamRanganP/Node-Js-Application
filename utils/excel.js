const xlsx = require("xlsx");

function readExcel(buffer){
    const bufferData = Buffer.from(buffer);
    const workbook = xlsx.read(bufferData, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; 
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
}

function extractDataFromNomination(dataArray ,sessionCount) {
    const participants = [];
    for (const item of dataArray) {
      const participant = {
        NEW_EMP_ID: item.NEW_EMP_ID,
        NAME: item.NAME,
        PRESENTCOUNT: 0,
        SESSIONCOUNT:sessionCount
      };
      participants.push(participant);
    }
    return participants;
};

function extractFromTeamsAttendance(dataArray) {
    const participants = [];
    let isParticipantSection = false;
    for (const item of dataArray) {
      if (item["1. Summary"] === "Name") {
        isParticipantSection = true;
        continue;
      }
      if (
        isParticipantSection &&
        item["1. Summary"] !== "3. In-Meeting Activities"
      ) {
        const participant = {
          Name: item["1. Summary"],
          "First Join": item.__EMPTY,
          "Last Leave": item.__EMPTY_1,
          "In-Meeting Duration": item.__EMPTY_2,
          Email: item.__EMPTY_3,
          "Participant ID (UPN)": item.__EMPTY_4.replace("@hexaware.com", ""),
          Role: item.__EMPTY_5,
        };
        participants.push(participant);
      } else if (item["1. Summary"] === "3. In-Meeting Activities") {
        break;
      }
    }
    return participants;
};

module.exports = { readExcel ,extractDataFromNomination ,extractFromTeamsAttendance }