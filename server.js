const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const path = require("path");
const ExcelJS = require('exceljs');
const bodyParser = require('body-parser');
const moment = require('moment');

const app = express();
const port = 3000;
app.use(bodyParser.json());
// Set up view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })
// Set up multer for file upload
// const upload = multer({ dest: "uploads/" });

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
// Import the necessary modules



// Endpoint for home page
app.get("/", (req, res) => {
  res.render("index");
});

// Endpoint for file upload
app.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).send("No file uploaded.");
  }

  try {
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0]; // Assuming there's only one sheet
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    res.render("result", { data });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error reading Excel file.");
  }
});
// app.post('/vlookup', upload.array('files', 1), (req, res) => {
app.post(
  "/vlookup",
  upload.fields([
    { name: "files1", maxCount: 15 },
    { name: "files2", maxCount: 1 },
  ]),
  (req, res) => {
    const files1 = req.files["files1"];
    const files2 = req.files["files2"];
    const delay = req.body.delay;

    // Ensure both files are uploaded
    if (!files1 || !files2) {
      return res.status(400).send("Please upload both files.");
    }

    try {
      const TrainingDetails = {
        Name: null,
        DateList: [],
        DateCount:files1.length
      };
      files1.map((file) => {
        console.log("file",file)
        const originalFileName = file.originalname;
        const pattern =
          /^(.*) - Attendance report (\d{1,2}-\d{1,2}-\d{2})\.csv$/;
        const match = originalFileName.match(pattern);
        if (match) {
          if (!TrainingDetails.Name) {
            TrainingDetails.Name = match[1];
          }
          const DateAttendanceObject = readExcel(file.buffer);
          const participantAttendedObject = extractParticipants(DateAttendanceObject)

          const filteredParticipants = participantAttendedObject.filter(participant => {
            const durationStr = participant['In-Meeting Duration'];
            const components = durationStr.split(' ');
            let hours = 0;
            let minutes = 0;
            let seconds = 0;
            let totalMinutes = 0;
            for (const component of components) {
                if (component.includes('h')) {
                    hours = parseInt(component);
                } else if (component.includes('m')) {
                    minutes = parseInt(component);
                } else if (component.includes('s')) {
                    seconds = parseInt(component);
                }
            }
            totalMinutes = hours * 60 + minutes + seconds / 60;
            return totalMinutes > delay;
        })

          TrainingDetails.DateList.push({date:match[2],data:filteredParticipants});
          console.log("participants filter",filteredParticipants.length)
          console.log("participants",participantAttendedObject.length)
        } else {
          console.log("No match found.");
        }
      });
      TrainingDetails.DateList.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA - dateB;
      });
      // console.log("Training Name:", TrainingDetails);
      const data2 = readExcel(files2[0].buffer);
      const employees = extractFromNominations(data2 , files1.length);
      TrainingDetails.DateList.forEach(dateEntry => {
        const currentDate = dateEntry.date;
        const dateData = dateEntry.data;
    
        employees.forEach(employee => {
            const employeeData = dateData.find(data => Number(data['Participant ID (UPN)']) === employee.NEW_EMP_ID);
            if (employeeData && employeeData.Role === 'Presenter') {
                if (!employee.Attendance) {
                    employee.Attendance = {}; // Initialize attendance object if not already present
                }
              employee.Attendance[currentDate] = 'P';
              employee.PRESENTCOUNT++; 
            } else {
              if (!employee.Attendance) {
                employee.Attendance = {}; // Initialize attendance object if not already present
              }
              employee.Attendance[currentDate] = 'A';
            }
        });
    });
    
      // console.log("Employee",employees)
    
      res.render("Attendance", { employees ,trainingName:TrainingDetails.Name ,dates: TrainingDetails.DateList });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error processing files.");
    }
  }
);

// function readExcel(filePath) {
  
 function readExcel(buffer){
  const bufferData = Buffer.from(buffer);
  const workbook = xlsx.read(bufferData, { type: 'buffer' });
  // const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0]; 
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
}

const extractFromNominations = (dataArray ,sessionCount) => {
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
const extractParticipants = (dataArray) => {
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


app.post('/export-excel', (req, res) => {
    const data = req.body;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gautam Rangan P';
    workbook.lastModifiedBy = 'Bot';
    const worksheet = workbook.addWorksheet('Attendance');
    const headers = [{header :'Emp_Id', key:'emp_id'},{header:'Name',key:'name'}];
    data.dates.forEach((date,index) => {
      const dateString = date.date;
      const parsedDate = moment.utc(dateString).startOf('day').toDate();
      headers.push({ header: parsedDate ,key:`date${index + 1}`});
    });
    headers.push({header:'No_of_Sessions',key:'session'}, {header:'No_of_Days_Present',key:'days'}, {header:'Attendance in %',key:'attendance'});
    worksheet.columns= headers;

    let excelDateLocate = []
    
    for (let i = 0; i < data.dates.length; i++) {
      worksheet.getColumn(`date${i + 1}`).numFmt = 'dd-mmm-yy'
      excelDateLocate.push(worksheet.getColumn(`date${i + 1}`).letter)
    }
    data.employees.forEach(employee => {
        const row = [
            employee.NEW_EMP_ID,
            employee.NAME
        ];
        data.dates.forEach(date => {
            row.push(employee.Attendance[date.date]);
        });
        row.push(
            employee.SESSIONCOUNT,
            employee.PRESENTCOUNT,
            ((employee.PRESENTCOUNT / employee.SESSIONCOUNT) * 100).toFixed(0) + '%'
        );
        worksheet.addRow(row);
    });
    
    for (let i = 0; i < data.dates.length; i++) {
      worksheet.getColumn(`date${i + 1}`).eachCell((cell,rowNumber)=>{
        if(rowNumber!==1){
          if(cell.value === "A"){
            cell.fill = {
              type: 'pattern',
              pattern:'solid',
              fgColor: { argb: 'FFFF0000' } 
            }
          }
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      })
    }

    worksheet.getColumn('session').eachCell((cell,rowNumber)=>{
      if(rowNumber !== 1){
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    })
        
    worksheet.getColumn('days').eachCell((cell,rowNumber)=>{
      if(rowNumber !== 1){
        if(excelDateLocate.length > 2 ){
          cell.value ={formula: `COUNTIFS(${excelDateLocate[0] + rowNumber}:${excelDateLocate[excelDateLocate.length-1] + rowNumber},"P")`}
        }
        else{
          cell.value = {formula:`COUNTIFS(${excelDateLocate[0] + rowNumber}:${excelDateLocate[0] + rowNumber},"P")`}
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    })

    let excelTotalDays = worksheet.getColumn('session').letter
    let excelDaysPresent = worksheet.getColumn('days').letter
    worksheet.getColumn('attendance').eachCell((cell,rowNumber)=>{
      if(rowNumber !== 1){
        cell.value ={formula: `ROUND(${excelDaysPresent+rowNumber}/${excelTotalDays + rowNumber}*100,0)`}
      }
    })
    
    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
          if(cell.value instanceof Date){
            maxLength = 10;
          }
          else{
            const length = cell.value ? cell.value.toString().length : 15;
            if (length > maxLength) { 
                maxLength = length;
            }
          }
        });
        column.width = maxLength < 15 ? 15 : maxLength;
    });

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
    cell.border = {
        top: {style:'thin', color: {argb:'000000'}},
        left: {style:'thin', color: {argb:'000000'}},
        bottom: {style:'thin', color: {argb:'000000'}},
        right: {style:'thin', color: {argb:'000000'}}
    };
    cell.fill = {
        type: 'pattern',
        pattern:'solid',
        fgColor:{argb:'B7D1F1'}
    };
    });
    const dataRows = worksheet.getRows(2, data.employees.length);
    dataRows.forEach(row => {
        row.eachCell((cell, colNumber) => {
            cell.border = {
                top: {style:'thin', color: {argb:'000000'}},
                left: {style:'thin', color: {argb:'000000'}},
                bottom: {style:'thin', color: {argb:'000000'}},
                right: {style:'thin', color: {argb:'000000'}}
            };
        });
    });
    let excelAttendance = worksheet.getColumn('attendance').letter
    worksheet.addConditionalFormatting({
      ref: `${excelAttendance}2:${excelAttendance + (data.employees.length+1)}`,
      rules: [
        {
          type: "dataBar",
          minLength: 0,
          maxLength: 100,
          cfvo: [{type: "min"}, {type: "max"}],
          color: {argb: "FFFF5050"}
        }
      ]
    }) 
    
    workbook.xlsx.writeBuffer()
        .then(buffer => {
            res.set({
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename=attendance.xlsx',
                'Content-Length': buffer.length
            });
            res.send(buffer);
        })
        .catch(err => {
            console.error('Error exporting Excel file:', err);
            res.status(500).send('Error exporting Excel file');
        });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
