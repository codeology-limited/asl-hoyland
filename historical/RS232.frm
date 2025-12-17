VERSION 5.00
Object = "{648A5603-2C6E-101B-82B6-000000000014}#1.1#0"; "MSCOMM32.OCX"
Object = "{BDC217C8-ED16-11CD-956C-0000C04E4C0A}#1.1#0"; "tabctl32.ocx"
Object = "{6FBA474E-43AC-11CE-9A0E-00AA0062BB4C}#1.0#0"; "sysinfo.ocx"
Object = "{831FDD16-0C5C-11D2-A9FC-0000F8754DA1}#2.2#0"; "MSCOMCTL.OCX"
Begin VB.Form COMForm 
   AutoRedraw      =   -1  'True
   BackColor       =   &H80000004&
   Caption         =   "Hoyland Generator 3.00"
   ClientHeight    =   9555
   ClientLeft      =   690
   ClientTop       =   345
   ClientWidth     =   14805
   FillStyle       =   0  'Solid
   Icon            =   "RS232.frx":0000
   LinkTopic       =   "Form1"
   MouseIcon       =   "RS232.frx":0CCA
   ScaleHeight     =   637
   ScaleMode       =   3  'Pixel
   ScaleWidth      =   987
   Begin MSComctlLib.StatusBar StatusBar1 
      Height          =   525
      Left            =   0
      TabIndex        =   1
      Top             =   9000
      Width           =   14760
      _ExtentX        =   26035
      _ExtentY        =   926
      SimpleText      =   "COMForm"
      _Version        =   393216
      BeginProperty Panels {8E3867A5-8586-11D1-B16A-00C0F0283628} 
         NumPanels       =   4
         BeginProperty Panel1 {8E3867AB-8586-11D1-B16A-00C0F0283628} 
            Alignment       =   1
            Object.Width           =   7937
            MinWidth        =   7937
            Text            =   "Copyright � 2018 Altered States Ltd"
            TextSave        =   "Copyright � 2018 Altered States Ltd"
         EndProperty
         BeginProperty Panel2 {8E3867AB-8586-11D1-B16A-00C0F0283628} 
            Object.Width           =   7541
            MinWidth        =   7541
         EndProperty
         BeginProperty Panel3 {8E3867AB-8586-11D1-B16A-00C0F0283628} 
            Object.Width           =   4498
            MinWidth        =   4498
            Text            =   "MODEL :"
            TextSave        =   "MODEL :"
         EndProperty
         BeginProperty Panel4 {8E3867AB-8586-11D1-B16A-00C0F0283628} 
            Object.Width           =   5953
            MinWidth        =   5953
            Text            =   "PORT: Not Connected"
            TextSave        =   "PORT: Not Connected"
         EndProperty
      EndProperty
      BeginProperty Font {0BE35203-8F91-11CE-9DE3-00AA004BB851} 
         Name            =   "Arial Narrow"
         Size            =   14.25
         Charset         =   0
         Weight          =   700
         Underline       =   0   'False
         Italic          =   0   'False
         Strikethrough   =   0   'False
      EndProperty
   End
   Begin TabDlg.SSTab SSTab1 
      Height          =   8655
      Left            =   0
      TabIndex        =   2
      Top             =   360
      Width           =   14775
      _ExtentX        =   26061
      _ExtentY        =   15266
      _Version        =   393216
      Tabs            =   4
      Tab             =   2
      TabsPerRow      =   4
      TabHeight       =   714
      BackColor       =   14737632
      ForeColor       =   16711680
      BeginProperty Font {0BE35203-8F91-11CE-9DE3-00AA004BB851} 
         Name            =   "MS Sans Serif"
         Size            =   13.5
         Charset         =   0
         Weight          =   700
         Underline       =   0   'False
         Italic          =   0   'False
         Strikethrough   =   0   'False
      EndProperty
      TabCaption(0)   =   "Rife/Crane Frequencies"
      TabPicture(0)   =   "RS232.frx":0FD4
      Tab(0).ControlEnabled=   0   'False
      Tab(0).Control(0)=   "Rife_background_picture"
      Tab(0).ControlCount=   1
      TabCaption(1)   =   "Text Window"
      TabPicture(1)   =   "RS232.frx":0FF0
      Tab(1).ControlEnabled=   0   'False
      Tab(1).Control(0)=   "Text4"
      Tab(1).Control(0).Enabled=   0   'False
      Tab(1).ControlCount=   1
      TabCaption(2)   =   "Hoyland  Sweep"
      TabPicture(2)   =   "RS232.frx":100C
      Tab(2).ControlEnabled=   -1  'True
      Tab(2).Control(0)=   "Hoyland_background_picture"
      Tab(2).Control(0).Enabled=   0   'False
      Tab(2).ControlCount=   1
      TabCaption(3)   =   "Tumours"
      TabPicture(3)   =   "RS232.frx":1028
      Tab(3).ControlEnabled=   0   'False
      Tab(3).Control(0)=   "Tumours_background_picture"
      Tab(3).ControlCount=   1
      Begin VB.PictureBox Tumours_background_picture 
         AutoSize        =   -1  'True
         DrawMode        =   15  'Merge Pen Not
         Height          =   8310
         Left            =   -75000
         Picture         =   "RS232.frx":1044
         ScaleHeight     =   7758.928
         ScaleMode       =   0  'User
         ScaleWidth      =   14745
         TabIndex        =   21
         Top             =   507
         Width           =   14805
         Begin VB.Frame Tumours_intensity 
            Caption         =   "Intensity"
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   2415
            Left            =   1680
            TabIndex        =   29
            Top             =   3960
            Width           =   6615
            Begin VB.TextBox Tumours_intensity_display 
               Alignment       =   1  'Right Justify
               BeginProperty DataFormat 
                  Type            =   1
                  Format          =   "0%"
                  HaveTrueFalseNull=   0
                  FirstDayOfWeek  =   0
                  FirstWeekOfYear =   0
                  LCID            =   5129
                  SubFormatType   =   5
               EndProperty
               BeginProperty Font 
                  Name            =   "SimSun"
                  Size            =   18
                  Charset         =   134
                  Weight          =   700
                  Underline       =   0   'False
                  Italic          =   0   'False
                  Strikethrough   =   0   'False
               EndProperty
               Height          =   495
               Left            =   2640
               Locked          =   -1  'True
               MaxLength       =   5
               TabIndex        =   30
               Text            =   "0 %"
               Top             =   360
               Width           =   1215
            End
            Begin MSComctlLib.Slider Tumours_intensity_ajust 
               Height          =   495
               Left            =   480
               TabIndex        =   31
               Top             =   1200
               Width           =   5655
               _ExtentX        =   9975
               _ExtentY        =   873
               _Version        =   393216
               Max             =   100
               TickFrequency   =   10
            End
         End
         Begin VB.CommandButton Tumours_start 
            Caption         =   "Start"
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   13.5
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   1680
            TabIndex        =   27
            Top             =   2880
            Width           =   1575
         End
         Begin VB.TextBox Tumours_current_frequency_display 
            Alignment       =   1  'Right Justify
            BeginProperty DataFormat 
               Type            =   1
               Format          =   "#,##0.00"
               HaveTrueFalseNull=   0
               FirstDayOfWeek  =   0
               FirstWeekOfYear =   0
               LCID            =   5129
               SubFormatType   =   1
            EndProperty
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   3720
            Locked          =   -1  'True
            TabIndex        =   26
            Top             =   2880
            Width           =   1815
         End
         Begin VB.TextBox Text7 
            Alignment       =   1  'Right Justify
            BeginProperty DataFormat 
               Type            =   1
               Format          =   "0%"
               HaveTrueFalseNull=   0
               FirstDayOfWeek  =   0
               FirstWeekOfYear =   0
               LCID            =   5129
               SubFormatType   =   5
            EndProperty
            BeginProperty Font 
               Name            =   "SimSun"
               Size            =   18
               Charset         =   134
               Weight          =   700
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   495
            Left            =   4320
            Locked          =   -1  'True
            MaxLength       =   5
            TabIndex        =   25
            Text            =   "0 %"
            Top             =   4440
            Width           =   1215
         End
         Begin VB.TextBox Tumours_frequencies_list 
            BeginProperty DataFormat 
               Type            =   0
               Format          =   "0"
               HaveTrueFalseNull=   0
               FirstDayOfWeek  =   0
               FirstWeekOfYear =   0
               LCID            =   5129
               SubFormatType   =   0
            EndProperty
            Height          =   3495
            Left            =   8640
            Locked          =   -1  'True
            MultiLine       =   -1  'True
            ScrollBars      =   2  'Vertical
            TabIndex        =   24
            Text            =   "RS232.frx":20443
            Top             =   2880
            Width           =   1335
         End
         Begin VB.TextBox Tumours_display_Hz 
            Alignment       =   2  'Center
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   700
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   5520
            TabIndex        =   23
            Text            =   "Hz"
            Top             =   2880
            Width           =   615
         End
         Begin VB.CommandButton Tumours_pause 
            Caption         =   "Pause"
            Enabled         =   0   'False
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   13.5
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   6600
            TabIndex        =   22
            Top             =   2880
            Width           =   1695
         End
         Begin MSComctlLib.Slider Slider1 
            Height          =   495
            Left            =   2160
            TabIndex        =   28
            Top             =   5280
            Width           =   5655
            _ExtentX        =   9975
            _ExtentY        =   873
            _Version        =   393216
            Max             =   100
            TickFrequency   =   10
         End
      End
      Begin VB.PictureBox Hoyland_background_picture 
         Height          =   8175
         Left            =   0
         Picture         =   "RS232.frx":204B8
         ScaleHeight     =   8115
         ScaleWidth      =   14835
         TabIndex        =   11
         Top             =   507
         Width           =   14895
         Begin VB.Frame Hoyland_intensity 
            Caption         =   "Intensity"
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   2415
            Left            =   4440
            TabIndex        =   18
            Top             =   5280
            Width           =   6615
            Begin VB.TextBox Hoyland_intensity_display 
               Alignment       =   1  'Right Justify
               BeginProperty DataFormat 
                  Type            =   1
                  Format          =   "0%"
                  HaveTrueFalseNull=   0
                  FirstDayOfWeek  =   0
                  FirstWeekOfYear =   0
                  LCID            =   5129
                  SubFormatType   =   5
               EndProperty
               BeginProperty Font 
                  Name            =   "SimSun"
                  Size            =   18
                  Charset         =   134
                  Weight          =   700
                  Underline       =   0   'False
                  Italic          =   0   'False
                  Strikethrough   =   0   'False
               EndProperty
               Height          =   495
               Left            =   2640
               Locked          =   -1  'True
               MaxLength       =   5
               TabIndex        =   19
               Text            =   "0 %"
               Top             =   480
               Width           =   1215
            End
            Begin MSComctlLib.Slider Hoyland_intensity_ajust 
               Height          =   495
               Left            =   480
               TabIndex        =   20
               Top             =   1320
               Width           =   5655
               _ExtentX        =   9975
               _ExtentY        =   873
               _Version        =   393216
               Max             =   100
               TickFrequency   =   10
            End
         End
         Begin VB.CommandButton Hoyland_pause 
            Caption         =   "Pause"
            Enabled         =   0   'False
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   2280
            TabIndex        =   17
            Top             =   2520
            Width           =   1695
         End
         Begin MSComctlLib.ProgressBar Hoyland_progress_bar 
            DragMode        =   1  'Automatic
            Height          =   495
            Left            =   360
            TabIndex        =   15
            ToolTipText     =   "Current Frequency"
            Top             =   4200
            Width           =   14055
            _ExtentX        =   24791
            _ExtentY        =   873
            _Version        =   393216
            Appearance      =   1
            Max             =   40000
            Scrolling       =   1
         End
         Begin VB.CommandButton Hoyland_start 
            Caption         =   "Start"
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   240
            TabIndex        =   12
            Top             =   2520
            Width           =   1695
         End
         Begin VB.Frame Hoyland_progress_frame 
            Caption         =   "Frequency in Hz"
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   13.5
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   1215
            Left            =   120
            TabIndex        =   16
            Top             =   3720
            Width           =   14535
         End
      End
      Begin VB.TextBox Text4 
         BeginProperty Font 
            Name            =   "SimSun"
            Size            =   10.5
            Charset         =   134
            Weight          =   400
            Underline       =   0   'False
            Italic          =   0   'False
            Strikethrough   =   0   'False
         EndProperty
         ForeColor       =   &H00FF0000&
         Height          =   7575
         Left            =   -74640
         Locked          =   -1  'True
         MultiLine       =   -1  'True
         ScrollBars      =   2  'Vertical
         TabIndex        =   9
         TabStop         =   0   'False
         Text            =   "RS232.frx":3F8B7
         Top             =   1107
         Width           =   14055
      End
      Begin VB.PictureBox Rife_background_picture 
         AutoSize        =   -1  'True
         DrawMode        =   15  'Merge Pen Not
         Height          =   8310
         Left            =   -75000
         Picture         =   "RS232.frx":416B3
         ScaleHeight     =   7758.928
         ScaleMode       =   0  'User
         ScaleWidth      =   14745
         TabIndex        =   3
         Top             =   507
         Width           =   14805
         Begin VB.CommandButton Rife_pause 
            Caption         =   "Pause"
            Enabled         =   0   'False
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   13.5
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   6600
            TabIndex        =   13
            Top             =   2880
            Width           =   1695
         End
         Begin VB.TextBox Rife_display_Hz 
            Alignment       =   2  'Center
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   700
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   5520
            TabIndex        =   10
            Text            =   "Hz"
            Top             =   2880
            Width           =   615
         End
         Begin VB.TextBox Rife_frequencies_list 
            BeginProperty DataFormat 
               Type            =   0
               Format          =   "0"
               HaveTrueFalseNull=   0
               FirstDayOfWeek  =   0
               FirstWeekOfYear =   0
               LCID            =   5129
               SubFormatType   =   0
            EndProperty
            Height          =   7695
            Left            =   120
            Locked          =   -1  'True
            MultiLine       =   -1  'True
            ScrollBars      =   2  'Vertical
            TabIndex        =   7
            Text            =   "RS232.frx":60AB2
            Top             =   360
            Width           =   1335
         End
         Begin VB.TextBox Rife_intensity_display 
            Alignment       =   1  'Right Justify
            BeginProperty DataFormat 
               Type            =   1
               Format          =   "0%"
               HaveTrueFalseNull=   0
               FirstDayOfWeek  =   0
               FirstWeekOfYear =   0
               LCID            =   5129
               SubFormatType   =   5
            EndProperty
            BeginProperty Font 
               Name            =   "SimSun"
               Size            =   18
               Charset         =   134
               Weight          =   700
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   495
            Left            =   4320
            Locked          =   -1  'True
            MaxLength       =   5
            TabIndex        =   6
            Text            =   "0 %"
            Top             =   4440
            Width           =   1215
         End
         Begin VB.TextBox Rife_current_frequency_display 
            Alignment       =   1  'Right Justify
            BeginProperty DataFormat 
               Type            =   1
               Format          =   "#,##0.00"
               HaveTrueFalseNull=   0
               FirstDayOfWeek  =   0
               FirstWeekOfYear =   0
               LCID            =   5129
               SubFormatType   =   1
            EndProperty
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   3720
            Locked          =   -1  'True
            TabIndex        =   5
            Top             =   2880
            Width           =   1815
         End
         Begin VB.CommandButton Rife_start 
            Caption         =   "Start"
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   13.5
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   615
            Left            =   1680
            TabIndex        =   4
            Top             =   2880
            Width           =   1575
         End
         Begin MSComctlLib.Slider Rife_intensity_ajust 
            Height          =   495
            Left            =   2160
            TabIndex        =   8
            Top             =   5280
            Width           =   5655
            _ExtentX        =   9975
            _ExtentY        =   873
            _Version        =   393216
            Max             =   100
            TickFrequency   =   10
         End
         Begin VB.Frame Rife_intensity 
            Caption         =   "Intensity"
            BeginProperty Font 
               Name            =   "MS Sans Serif"
               Size            =   18
               Charset         =   0
               Weight          =   400
               Underline       =   0   'False
               Italic          =   0   'False
               Strikethrough   =   0   'False
            EndProperty
            Height          =   2415
            Left            =   1680
            TabIndex        =   14
            Top             =   3960
            Width           =   6615
         End
      End
   End
   Begin SysInfoLib.SysInfo SysInfo1 
      Left            =   5880
      Top             =   0
      _ExtentX        =   1005
      _ExtentY        =   1005
      _Version        =   393216
   End
   Begin MSCommLib.MSComm MSComm1 
      Left            =   6480
      Top             =   0
      _ExtentX        =   1005
      _ExtentY        =   1005
      _Version        =   393216
      DTREnable       =   0   'False
      InBufferSize    =   4096
      OutBufferSize   =   4096
      EOFEnable       =   -1  'True
      InputMode       =   1
   End
   Begin MSComctlLib.StatusBar StatusBar2 
      Align           =   2  'Align Bottom
      Height          =   0
      Left            =   0
      TabIndex        =   0
      Top             =   9555
      Width           =   14805
      _ExtentX        =   26114
      _ExtentY        =   0
      _Version        =   393216
      BeginProperty Panels {8E3867A5-8586-11D1-B16A-00C0F0283628} 
         NumPanels       =   1
         BeginProperty Panel1 {8E3867AB-8586-11D1-B16A-00C0F0283628} 
         EndProperty
      EndProperty
   End
End
Attribute VB_Name = "COMForm"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
'FY2300H-25M
Private Declare Sub sleep Lib "kernel32" (ByVal dwMilliseconds As Long)
Private Declare Function timeGetTime Lib "winmm.dll" () As Long
Private Declare Function ShellExecute Lib "shell32.dll" Alias "ShellExecuteA" (ByVal hwnd As Long, ByVal lpOperation As String, ByVal lpFile As String, ByVal lpParameters As String, ByVal lpDirectory As String, ByVal nShowCmd As Long) As Long
Private Declare Function RegOpenKey Lib "advapi32.dll" Alias "RegOpenKeyA" (ByVal hKey As Long, ByVal lpSubKey As String, phkResult As Long) As Long
Private Declare Function RegEnumValue Lib "advapi32.dll" Alias "RegEnumValueA" (ByVal hKey As Long, ByVal dwIndex As Long, ByVal lpValueName As String, lpcbValueName As Long, ByVal lpReserved As Long, lpType As Long, ByVal lpData As String, lpcbData As Long) As Long

Dim HScro13 As Integer

Dim delay, t As Integer
Dim numoffreq As Integer
Dim FreqArray() As String

Dim COM_SEL As Integer
Dim Com_Bd As String

Dim send_EN As Long

'Dim GongDongBL  As Long
Dim PingLvMax  As Double

Dim DDS_COM  As Integer

Dim zhanko(2)  As String
Dim kill_delay As Integer
Const HKEY_LOCAL_MACHINE = &H80000002
Const REG_SZ = 1
Dim i&, ComStr$(), S


Private Sub Form_Load()
    Dim i, j, t, z  As Integer
    Dim ss, ss2
    Dim str As String
     
    StatusBar1.Panels(1) = "Copyright � 2022 Altered States Ltd"
    COM_SEL = 1
        
    HScro13 = True
        
    send_EN = True
    
    PingLvMax = 2000000
       
    
    'If GetAllPort = False Then
        'Com_Bd = "115200"
        Call GetAllPort
    'End If
           
    'Call LianJie

End Sub

Private Function delay_ms(mS As Long) As Boolean
    
    de = timeGetTime '
    While timeGetTime <= de + mS And kill_delay = 0
        DoEvents
    Wend
    kill_delay = 0
End Function

 

Private Function Test_COM(com_num As Integer) As Boolean
    
    On Error GoTo Comm_Error
      If (MSComm1.PortOpen = False) Then
        MSComm1.CommPort = com_num
        MSComm1.PortOpen = True
        MSComm1.PortOpen = False
        Test_COM = True
       
        MSComm1.CommPort = com_num
        MSComm1.Settings = Com_Bd + ",N,8,1"
        MSComm1.NullDiscard = False
        MSComm1.InputMode = 0
        MSComm1.PortOpen = True
      End If
     
     Test_COM = True
     Exit Function
        
Comm_Error:
        
        If Err.Number = 8002 Then
            StatusBar1.Panels(2) = "Port does not exist!"
            MsgBox "Port does not exist!"
        ElseIf Err.Number = 8005 Then
            StatusBar1.Panels(2) = "Port is already open!"
        ElseIf Err.Number = 8016 Then
            StatusBar1.Panels(2) = "Port occupied by other software!"
            MsgBox "Port occupied by other software!"
        ElseIf Err.Number = 8018 Then
            StatusBar1.Panels(2) = "Port failed to open!"
            MsgBox "Port failed to open!"
        Else
            StatusBar1.Panels(2) = "Unknown Error!"
            MsgBox "Unknown Error!"
        End If
        
        Test_COM = False
  
End Function



Private Function COM_TV(com_num As Integer) As Boolean

    
 On Error GoTo Comms_Error
    If (MSComm1.PortOpen = False) Then
        MSComm1.CommPort = com_num
        MSComm1.PortOpen = True
        MSComm1.PortOpen = False
                                          
        MSComm1.CommPort = com_num
        MSComm1.Settings = Com_Bd + ",N,8,1"
        MSComm1.NullDiscard = False
        MSComm1.InputMode = 0
        MSComm1.PortOpen = True

    End If

    COM_TV = True

    Exit Function

Comms_Error:

 COM_TV = False
 
End Function


Private Function send(str As String)

If send_EN = False Then
    Exit Function
End If

If (COM_TV(COM_SEL) = True) Then

     MSComm1.Output = str + Chr(&HA)
     
End If

End Function

Private Function GetAllPort() As Integer

    Dim str As String
    Dim i, j, m  As Integer
    Dim ss, ss2
   
    On Error Resume Next
    Rife_start.Enabled = False
    Hoyland_start.Enabled = False
    Tumours_start.Enabled = False
    GetAllPort = False
    
    S = GetSerialPort(HKEY_LOCAL_MACHINE, "HARDWARE\DEVICEMAP\SERIALCOMM")
    
    If ComStr(0) = "" Then Exit Function
    
    GetAllPort = ""
    

    MSComm1.OutBufferCount = 0
    MSComm1.InBufferCount = 0
         '
    
    For i = 0 To UBound(S)
        Com_Bd = "9600"
        For t = 0 To 1

        ss2 = Replace(Left(S(i), 5), "COM", "")

        MSComm1.CommPort = Val(ss2)
        MSComm1.PortOpen = True
        MSComm1.PortOpen = False

        MSComm1.CommPort = Val(ss2)
        MSComm1.Settings = Com_Bd + ",N,8,1"
        MSComm1.NullDiscard = False
        MSComm1.InputMode = 0
        MSComm1.PortOpen = True
        
               
        MSComm1.Output = "UMO" + Chr(&HA)    'read the machine model

        delay_ms (30)

        str = Trim(MSComm1.Input)
        MSComm1.Output = "UMO" + Chr(&HA)    'read the machine model

        delay_ms (30)

        str = Trim(MSComm1.Input)
                
        If Left(str, 4) = "FY23" Or Left(str, 4) = "FY63" Then
 
           StatusBar1.Panels(3) = "MODEL: " + str
          
          m = Val(ss2)
          COM_SEL = m
          
          StatusBar1.Panels(4) = "PORT: COM" + ss2 + " Connected"
          
          GetAllPort = True
          
          Call LianJie
          Rife_start.Enabled = True
          Hoyland_start.Enabled = True
          
          Call TurnOnTumours
          
          Exit Function
        End If
        Com_Bd = "115200"
        Next t
Next i
    
    If GetAllPort = False Then
       StatusBar1.Panels(4) = "PORT: Not Connected"
    End If
    

End Function

Private Function TurnOnTumours()
    If PingLvMax >= 30000000 Then
        Tumours_start.Enabled = True
    End If
End Function


Private Function GetSerialPort(RegAddr&, Items$) As String()
    
    On Error Resume Next
    
    Dim hKey&, S1$, S2$, L&, L1&, j&
    
    RegOpenKey RegAddr, Items, hKey
    
    ReDim Preserve ComStr$(0)
    
    ComStr(0) = "": i = 0: j = 0: Rtn = 0
    
    Do
        L = 1000: L1 = 1000
        S1 = Space(L): S2 = Space(L)
        Rtn = RegEnumValue(hKey, i, S1, L, 0, REG_SZ, S2, L1)
        
        If Rtn = 0 Then
            If InStr(S1, Chr(0)) > 0 And InStr(S2, Chr(0)) > 0 Then
                S1 = UCase(Left(S1, InStr(S1, Chr(0)) - 1))
                S2 = UCase(Left(S2, InStr(S2, Chr(0)) - 1))
                If InStr(S2, "COM") > 0 Then
                    ReDim Preserve ComStr$(j)
                    ComStr(j) = S2
                    j = j + 1
                End If
            End If
        End If
        i = i + 1
    Loop Until Rtn <> 0
    
    GetSerialPort = ComStr()
End Function


Private Sub Rife_pause_Click()
If Rife_pause.Caption = "Pause" Then
    Rife_start.Enabled = False
    Rife_pause.Caption = "Resume"
    Rife_frequencies_list.Enabled = True
Else
    Rife_pause.Caption = "Pause"
    Rife_start.Enabled = True
    Rife_frequencies_list.Enabled = False
End If

End Sub


Private Sub Hoyland_start_Click()

Dim frequency As Long

SSTab1.TabEnabled(0) = False
SSTab1.TabEnabled(1) = False
SSTab1.TabEnabled(3) = False

Hoyland_start.Enabled = False
delay = 350 'set default delay time
If Hoyland_start.Caption = "Stop" Then
    Hoyland_pause.Enabled = False
    Exit Sub
End If

Hoyland_progress_frame.Caption = "Starting "
Call initial

'Set Ch2 the amplitude to 2v 10%
'send ("WFA02.00")
'delay_ms (delay)


'Set Ch1 to square wave
send ("WMW01")
delay_ms (400)

'Set Ch1 frequency to 0hz
send ("WMF00000000000000")
delay_ms (delay)

'Set Ch1 amplitude to 2v 10%
send ("WMA020.00")
Hoyland_intensity_ajust.Value = 100
Hoyland_intensity_display.Text = "100 %"
delay_ms (delay)

'Set Ch1 offset to 0
send ("WMO00.00")
delay_ms (delay)

'Set Ch1 duty cycle to 50%
send ("WMD50.0")
delay_ms (delay)

'Set Ch1 phase to 0
send ("WMP000")
delay_ms (delay)

'Set Ch1 attenuation to 0
send ("WMT0")
delay_ms (delay)

'Set Ch1 on
send ("WMN1")
delay_ms (delay)

'synchronise voltage output
send ("USA2")
delay_ms (delay)

Hoyland_pause.Enabled = True
Hoyland_start.Caption = "Stop"
Hoyland_start.Enabled = True

For frequency = 1 To 40000
While Hoyland_pause.Caption = "Resume"
    DoEvents
Wend
If Hoyland_pause.Enabled = False Then
    frequency = 40000
End If

Hoyland_progress_frame.Caption = "Frequency: " + Format(frequency, "#,###,###") + " Hz"

    send ("WMF" + Trim(str(frequency)))  'set CH1 frequency
    Hoyland_progress_bar.Value = frequency
    delay_ms (190)    '
    
Next
Hoyland_pause.Enabled = False
'Turn off sync between CH1 and CH2 voltage
send ("USD2")
delay_ms (delay)

'strText = "WFN0"    'Set Ch2 off
send ("WFN0")
delay_ms (delay)

'strText = "WMN0"    'Set Ch1 off
send ("WMN0")
delay_ms (delay)

Hoyland_progress_frame.Caption = "Stopped "

Hoyland_start.Caption = "Start"
Hoyland_start.Enabled = True
SSTab1.TabEnabled(0) = True
SSTab1.TabEnabled(1) = True
SSTab1.TabEnabled(3) = True
End Sub

Private Sub Hoyland_pause_Click()
If Hoyland_pause.Caption = "Pause" Then
    Hoyland_start.Enabled = False
    Hoyland_pause.Caption = "Resume"
Else
    Hoyland_pause.Caption = "Pause"
    Hoyland_start.Enabled = True
End If

End Sub

Private Function ReadSettings()

    Dim str1 As String
    Dim str2 As String
    Dim sa(50) As String

    MSComm1.Output = "RMW" + Chr(&HA)    'read the CH1 waveform
    delay_ms (30)
    sa(0) = Trim(MSComm1.Input)
    
    MSComm1.Output = "RMF" + Chr(&HA)    'read the frequency of CH1form
    delay_ms (30)
    sa(1) = Trim(MSComm1.Input)
    
    MSComm1.Output = "RMA" + Chr(&HA)    'read the CH1 amplitude
    delay_ms (30)
    sa(2) = Trim(MSComm1.Input)

    MSComm1.Output = "RMO" + Chr(&HA)    'read the CH1 bias
    delay_ms (30)
    sa(3) = Trim(MSComm1.Input)

    MSComm1.Output = "RMD" + Chr(&HA)    'read the CH1 duty
    delay_ms (30)
    sa(4) = Trim(MSComm1.Input)

    MSComm1.Output = "RMP" + Chr(&HA)    'read the CH1 phase
    delay_ms (30)
    sa(5) = Trim(MSComm1.Input)

    MSComm1.Output = "RMT" + Chr(&HA)    'read the CH1 attenuation
    delay_ms (30)
    sa(6) = Trim(MSComm1.Input)

    MSComm1.Output = "RMN" + Chr(&HA)    'read the CH1 output start / stop
    delay_ms (30)
    sa(7) = Trim(MSComm1.Input)

    MSComm1.Output = "RPM" + Chr(&HA)    'read the CH1 trigger mode
    delay_ms (30)
    sa(8) = Trim(MSComm1.Input)

    MSComm1.Output = "RPN" + Chr(&HA)    'read the number of CH1 trigger pulse
    delay_ms (30)
    sa(9) = Trim(MSComm1.Input)


    MSComm1.Output = "RFW" + Chr(&HA)    'read the CH2 waveform
    delay_ms (30)
    sa(10) = Trim(MSComm1.Input)
    
    MSComm1.Output = "RFF" + Chr(&HA)    'read the CH2 frequency
    delay_ms (30)
    sa(11) = Trim(MSComm1.Input)
    
    MSComm1.Output = "RFA" + Chr(&HA)    'read the magnitude of CH2
    delay_ms (30)
    sa(12) = Trim(MSComm1.Input)

    MSComm1.Output = "RFO" + Chr(&HA)    'read the CH2 offset
    delay_ms (30)
    sa(13) = Trim(MSComm1.Input)

    MSComm1.Output = "RFD" + Chr(&HA)    'read the CH2 duty
    delay_ms (30)
    sa(14) = Trim(MSComm1.Input)

    MSComm1.Output = "RFP" + Chr(&HA)    'read the CH2 phase
    delay_ms (30)
    sa(15) = Trim(MSComm1.Input)

    MSComm1.Output = "RFT" + Chr(&HA)    'read CH2 attenuation
    delay_ms (30)
    sa(16) = Trim(MSComm1.Input)

    MSComm1.Output = "RFN" + Chr(&HA)    'Read the start / stop of CH2
    delay_ms (30)
    sa(17) = Trim(MSComm1.Input)


    
    send_EN = False
    If t = 0 Then sa(2) = Val(sa(2)) * 100
    str1 = Format(Val(sa(2)) / 100, "00.00")   'CH1 Amplitude
    
    'If Val(sa(3)) < 1000 Then   'CH1 Offset
    '  str2 = Format(Val(sa(3) * (-1)) / 100, "00.00")
    'Else
     ' str2 = Format(Val(sa(3) - 1000) / 100, "00.00")
    'End If
    
    Rife_intensity_display.Text = Format((Val(str1) * 5) / 10000, "0 %")
    Rife_intensity_ajust.Value = Val(Rife_intensity_display.Text)
    
    Hoyland_intensity_display.Text = Format((Val(str1) * 5) / 10000, "0 %")
    Hoyland_intensity_ajust = Val(Hoyland_intensity_display.Text)
    
    'If Val(sa(6)) > 0 Then  'CH1 attenuation
    '    str1 = Format(Val(str1) / 10, "0.000")
    '    str2 = Format(Val(str2) / 10, "0.000")
    
    'End If
    
    'str1 = Format(Val(sa(12)) / 100, "00.00")   'magnitude of CH2
    
    'If Val(sa(13)) < 1000 Then  'CH2 bias
    ' str2 = Format(Val(sa(13) * (-1)) / 100, "00.00")
    'Else
    '  str2 = Format(Val(sa(13) - 1000) / 100, "00.00")
    'End If
    
    send_EN = True

End Function

Private Function LianJie()
    Dim str As String
    
    
    PingLvMax = 2000000

     If (Test_COM(COM_SEL) = True) Then
    
        MSComm1.Output = "UMO" + Chr(&HA)    'read the machine model
    
        delay_ms (50)
    
        str = Trim(MSComm1.Input)
        'z = 0
        z = InStr(str, "-")
    
        If Left(str, 4) = "FY23" And z = 0 Then 'check model number
        
            str = Left(str, 6)
            str = Right(str, 2)
            PingLvMax = Val(str) * 1000000  'sets max Frequency device is capable of
                                                          
            Call ReadSettings
         End If
         
         'If Left(str, 4) = "FY63" Then  'check model number
        If z > 0 Then
            str = Left(str, z + 2)
            str = Right(str, 2)
            PingLvMax = Val(str) * 1000000  'sets max Frequency device is capable of
                                                          
            Call ReadSettings
         End If
       StatusBar1.Panels(2) = PingLvMax
      End If
End Function

Private Sub Rife_intensity_ajust_Scroll()

If HScro13 = True Then
    Rife_intensity_display.Text = Format(Val(Rife_intensity_ajust.Value) / 100, "0 %")
End If

End Sub
Private Sub Hoyland_intensity_ajust_Scroll()

If HScro13 = True Then
    Hoyland_intensity_display.Text = Format(Val(Hoyland_intensity_ajust.Value) / 100, "0 %")
End If

End Sub

Private Sub Tumours_intensity_ajust_Scroll()

If HScro13 = True Then
    Tumours_intensity_display.Text = Format(Val(Tumours_intensity_ajust.Value) / 100, "0 %")
End If

End Sub
Private Sub SSTab1_Click(PreviousTab As Integer)

If (SSTab1.Tab = 2) Or (SSTab1.Tab = 0) Or (SSTab1.Tab = 3) Then

   Call GetAllPort  'COM_XH(COM_SEL)
    
End If

End Sub


Private Sub Rife_intensity_display_Change()

Dim strText As String

HScro13 = False

strText = Val(Rife_intensity_display.Text)

strText = Format(Val(strText) / 5, "00.00")

HScro13 = True
    
send ("WMA" + strText) 'Set amplitude (0 - 20v)


End Sub

Private Sub Hoyland_intensity_display_Change()

Dim strText As String

HScro13 = False

strText = Val(Hoyland_intensity_display.Text)

strText = Format(Val(strText) / 5, "00.00")

HScro13 = True
    
send ("WMA" + strText) 'Set amplitude (0 - 20v)


End Sub

Private Sub Tumours_intensity_display_Change()

Dim strText As String

HScro13 = False

strText = Val(Tumours_intensity_display.Text)

strText = Format(Val(strText) / 5, "00.00")

HScro13 = True
    
send ("WMA" + strText) 'Set amplitude (0 - 20v)


End Sub
Private Sub Toolbar1_ButtonClick(ByVal Button As MSComctlLib.Button)
    On Error Resume Next
    Select Case Button.Key
                
        Case "��������ʲô"
            SSTab1.Tab = 1  'help display
    End Select
End Sub


Private Sub Form_Unload(Cancel As Integer)
    
    If MsgBox("Sure to quit?" + vbCrLf + vbCrLf, vbOKCancel + vbQuestion + vbDefaultButton2, "Quit") = vbCancel Then
      Cancel = True
    End If
    
    If (MSComm1.PortOpen = True) Then
      MSComm1.PortOpen = False
    End If
    
End Sub
 




Private Sub ���ʹ��˵��_Click()
  SSTab1.Tab = 1
End Sub

Private Sub Rife_start_Click()
'Dim FreqArray() As String

SSTab1.TabEnabled(2) = False
SSTab1.TabEnabled(3) = False
Rife_start.Enabled = False
Rife_frequencies_list.Enabled = False
delay = 350 'set default delay time
If Rife_start.Caption = "Stop" Then
    
    numoffreq = UBound(FreqArray) - 1
    Rife_pause.Enabled = False
    Rife_current_frequency_display.Text = "Stopping "
    kill_delay = 1
    Exit Sub
End If

Rife_current_frequency_display.Text = "Starting "
Call initial


strText = "WFA02.00"    'Set Ch2 the amplitude to 2v 10%
send (strText)
delay_ms (delay)


'MSComm1.Output = "WMW01"    'Set Ch1 to square wave
strText = "WMW01"
send (strText)
delay_ms (delay)

'MSComm1.Output = "WMF0000000000000"    'Set Ch1 frequency to 0hz
strText = "WMF0000"
send (strText)
delay_ms (delay)

strText = "WMA02.00"    'Set Ch1 amplitude to 2v 10%
send (strText)
Rife_intensity_ajust.Value = 10
Rife_intensity_display.Text = "10 %"
delay_ms (delay)

strText = "WMO00.00"    'Set Ch1 offset to 0
send (strText)
delay_ms (delay)

strText = "WMD50.0"    'Set Ch1 duty cycle to 50%
send (strText)
delay_ms (delay)

strText = "WMP000"    'Set Ch1 phase to 0
send (strText)
delay_ms (delay)

strText = "WMT0"    'Set Ch1 attenuation to 0
send (strText)
delay_ms (delay)

strText = "WMN1"    'Set Ch1 on
send (strText)
delay_ms (delay)

strText = "USA2"    'synchronise voltage output
send (strText)
delay_ms (delay)

'Dim FreqArray() As String
FreqArray() = Split(Rife_frequencies_list.Text, (Chr(13) + Chr(&HA)))
Rife_pause.Enabled = True
Rife_start.Caption = "Stop"
Rife_start.Enabled = True

For numoffreq = 0 To UBound(FreqArray) - 1
While Rife_pause.Caption = "Resume"
    DoEvents
Wend
Rife_current_frequency_display.Text = Format(Val(Trim(FreqArray(numoffreq))), "#,###,###.######") + " "

strText = Format(Val(FreqArray(numoffreq)), "0000000000.000000")
    strText = "WMF" + strText 'set CH1 frequency
    send (strText)
    delay_ms (10000)    'run frequency for 10 secs
    
Next
Rife_pause.Enabled = False
strText = "USD2"    'Turn off sync between CH1 and CH2 voltage
send (strText)
delay_ms (delay)

strText = "WFN0"    'Set Ch2 off
send (strText)
delay_ms (delay)

strText = "WMN0"    'Set Ch1 off
send (strText)
delay_ms (delay)

Rife_current_frequency_display.Text = "Finished "

Rife_frequencies_list.Enabled = True
Rife_start.Caption = "Start"
Rife_start.Enabled = True
SSTab1.TabEnabled(2) = True
SSTab1.TabEnabled(3) = True
End Sub

Private Sub initial()

strText = "UBZ1"    'Turn on Buzzer
send (strText)

inpt = 0
While inpt = 0
    
    MSComm1.Output = "RBZ" + Chr(&HA)    'read the buzzer switch status
    delay_ms (20)
    inpt = Trim(MSComm1.Input)
    
Wend


inpt = ""
While inpt <> 0

    MSComm1.Output = "RMS" + Chr(&HA)    'read master or slave
    delay_ms (100)
    inpt = Trim(MSComm1.Input)
    strText = "UMS0"    'set to master
    send (strText)
    'delay_ms (100)
  
Wend


inpt = ""
While inpt <> 0

    MSComm1.Output = "RUL" + Chr(&HA)    'read state
    delay_ms (100)
    inpt = Trim(MSComm1.Input)
    strText = "UUL0"    'set to no cascading
    send (strText)
    'delay_ms (100)

Wend

'MSComm1.Output = "WFW00"    'Set Ch2 to sine wave
'strText = "WFW00"
send ("WFW00")
delay_ms (400)

'MSComm1.Output = "WFF3300000000000"    'Set Ch2 to frequency to 3.1mhz
'strText = "WFF3100000000000"
send ("WFF3100000.000000")
delay_ms (700)

'strText = "WFO00.00"    'Set Ch2 offset to 0
send ("WFO00.00")
delay_ms (delay)

'strText = "WFD50.0"    'Set Ch2 duty cycle to 50%
send (WFD50.0")
delay_ms (delay)

'strText = "WFP000"    'Set Ch2 the phase to 0
send ("WFP000")
delay_ms (delay)

'strText = "WFT0"    'Set Ch2 the attenuation to 0
send ("WFT0")
delay_ms (delay)

'strText = "WFN1"    'Set Ch2 on
send ("WFN1")
delay_ms (delay)

End Sub

Private Sub Tumours_start_Click()
'Dim FreqArray() As String

SSTab1.TabEnabled(2) = False
SSTab1.TabEnabled(0) = False
Tumours_start.Enabled = False
Tumours_frequencies_list.Enabled = False
delay = 350 'set default delay time
If Tumours_start.Caption = "Stop" Then
    
    numoffreq = UBound(FreqArray) - 1
    Tumours_pause.Enabled = False
    kill_delay = 1
    Tumours_current_frequency_display.Text = "Stopping "
    Exit Sub
End If

Tumours_current_frequency_display.Text = "Starting "
Call initial


strText = "WFA20.00"    'Set Ch2 the amplitude to 20v
send (strText)
delay_ms (delay)


'MSComm1.Output = "WMW01"    'Set Ch1 to square wave
strText = "WMW01"
send (strText)
delay_ms (delay)

'MSComm1.Output = "WMF0000000000000"    'Set Ch1 frequency to 0hz
strText = "WMF0000"
send (strText)
delay_ms (delay)
WMA102.00
strText = "WMA20.00"    'Set Ch1 amplitude to 20v
send (strText)
Tumours_intensity_ajust.Value = 100
Tumours_intensity_display.Text = "100 %"
delay_ms (delay)

strText = "WMO00.00"    'Set Ch1 offset to 0
send (strText)
delay_ms (delay)

strText = "WMD50.0"    'Set Ch1 duty cycle to 50%
send (strText)
delay_ms (delay)

strText = "WMP000"    'Set Ch1 phase to 0
send (strText)
delay_ms (delay)

strText = "WMT0"    'Set Ch1 attenuation to 0
send (strText)
delay_ms (delay)

'MSComm1.Output = "WFF3300000000000"    'Set Ch2 to frequency to 27.1mhz
'strText = "WFF3100000000000"
send ("WFF27100000.000000")
delay_ms (700)


strText = "WMN1"    'Set Ch1 on
send (strText)
delay_ms (delay)

strText = "USA2"    'synchronise voltage output
send (strText)
delay_ms (delay)

'Dim FreqArray() As String
FreqArray() = Split(Tumours_frequencies_list.Text, (Chr(13) + Chr(&HA)))
Tumours_pause.Enabled = True
Tumours_start.Caption = "Stop"
Tumours_start.Enabled = True

For numoffreq = 0 To UBound(FreqArray) - 1
While Tumours_pause.Caption = "Resume"
    DoEvents
Wend
Tumours_current_frequency_display.Text = Format(Val(Trim(FreqArray(numoffreq))), "#,###,###.######") + " "

strText = Format(Val(FreqArray(numoffreq)), "00000000.000000")
    strText = "WMF" + strText 'set CH1 frequency
    send (strText)
    delay_ms (180000)    'run frequency for 3 mins
    
Next
Tumours_pause.Enabled = False
strText = "USD2"    'Turn off sync between CH1 and CH2 voltage
send (strText)
delay_ms (delay)

strText = "WFN0"    'Set Ch2 off
send (strText)
delay_ms (delay)

strText = "WMN0"    'Set Ch1 off
send (strText)
delay_ms (delay)

Tumours_current_frequency_display.Text = "Finished "

Tumours_frequencies_list.Enabled = True
Tumours_start.Caption = "Start"
Tumours_start.Enabled = True
SSTab1.TabEnabled(2) = True
SSTab1.TabEnabled(0) = True
End Sub

Private Sub Tumours_pause_Click()
If Tumours_pause.Caption = "Pause" Then
    Tumours_start.Enabled = False
    Tumours_pause.Caption = "Resume"
    Tumours_frequencies_list.Enabled = True
Else
    Tumours_pause.Caption = "Pause"
    Tumours_start.Enabled = True
    Tumours_frequencies_list.Enabled = False
End If

End Sub
