using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CrewLink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Crew",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Rank = table.Column<string>(type: "TEXT", nullable: false),
                    Nationality = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    DateOfBirth = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Phone = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Crew", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: false),
                    Role = table.Column<string>(type: "TEXT", nullable: false),
                    CrewId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Vessels",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    ImoNumber = table.Column<string>(type: "TEXT", maxLength: 7, nullable: false),
                    Flag = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Type = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    MinimumSafeManning = table.Column<string>(type: "TEXT", nullable: false),
                    ReadyToSail = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vessels", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Certifications",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    CrewId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Type = table.Column<string>(type: "TEXT", nullable: false),
                    IssueDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    ExpiryDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    IssuingAuthority = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Document = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Certifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Certifications_Crew_CrewId",
                        column: x => x.CrewId,
                        principalTable: "Crew",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Assignments",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    CrewId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    VesselId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    RankOnboard = table.Column<string>(type: "TEXT", nullable: false),
                    SignOnDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    SignOffDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Port = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Assignments_Crew_CrewId",
                        column: x => x.CrewId,
                        principalTable: "Crew",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Assignments_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_CrewId_Status",
                table: "Assignments",
                columns: new[] { "CrewId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_SignOffDate",
                table: "Assignments",
                column: "SignOffDate");

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_SignOnDate",
                table: "Assignments",
                column: "SignOnDate");

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_VesselId_Status",
                table: "Assignments",
                columns: new[] { "VesselId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Certifications_CrewId",
                table: "Certifications",
                column: "CrewId");

            migrationBuilder.CreateIndex(
                name: "IX_Certifications_ExpiryDate",
                table: "Certifications",
                column: "ExpiryDate");

            migrationBuilder.CreateIndex(
                name: "IX_Certifications_Type",
                table: "Certifications",
                column: "Type");

            migrationBuilder.CreateIndex(
                name: "IX_Crew_Name",
                table: "Crew",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Crew_Nationality",
                table: "Crew",
                column: "Nationality");

            migrationBuilder.CreateIndex(
                name: "IX_Crew_Rank",
                table: "Crew",
                column: "Rank");

            migrationBuilder.CreateIndex(
                name: "IX_Crew_Status",
                table: "Crew",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Vessels_ImoNumber",
                table: "Vessels",
                column: "ImoNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Vessels_Name",
                table: "Vessels",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_Vessels_Status",
                table: "Vessels",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Assignments");

            migrationBuilder.DropTable(
                name: "Certifications");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Vessels");

            migrationBuilder.DropTable(
                name: "Crew");
        }
    }
}
