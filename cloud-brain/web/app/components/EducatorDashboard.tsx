'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  TrendingUp,
  CheckCircle,
  Warning,
  School,
} from '@mui/icons-material';
import type {
  DashboardData,
  StudentProgress,
  ClassPerformanceReport,
  CurriculumCoverageReport,
} from '../types';
import { mockDashboardData } from '../mockData';

export const EducatorDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // For development, use mock data
      await new Promise(resolve => setTimeout(resolve, 500));
      setDashboardData(mockDashboardData);
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!dashboardData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="info">No dashboard data available</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Sikshya-Sathi Educator Dashboard
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Students
                  </Typography>
                  <Typography variant="h4">
                    {dashboardData.student_progress.length}
                  </Typography>
                </Box>
                <School color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Active Students
                  </Typography>
                  <Typography variant="h4">
                    {dashboardData.class_reports[0]?.active_students || 0}
                  </Typography>
                </Box>
                <TrendingUp color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Avg Accuracy
                  </Typography>
                  <Typography variant="h4">
                    {(dashboardData.class_reports[0]?.average_accuracy * 100 || 0).toFixed(0)}%
                  </Typography>
                </Box>
                <CheckCircle color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Struggling
                  </Typography>
                  <Typography variant="h4">
                    {dashboardData.class_reports[0]?.struggling_students.length || 0}
                  </Typography>
                </Box>
                <Warning color="warning" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={selectedTab} onChange={handleTabChange}>
          <Tab label="Student Progress" />
          <Tab label="Class Performance" />
          <Tab label="Curriculum Coverage" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {selectedTab === 0 && (
        <StudentProgressTab studentProgress={dashboardData.student_progress} />
      )}
      {selectedTab === 1 && (
        <ClassPerformanceTab classReports={dashboardData.class_reports} />
      )}
      {selectedTab === 2 && (
        <CurriculumCoverageTab coverageReports={dashboardData.coverage_reports} />
      )}
    </Container>
  );
};

const StudentProgressTab: React.FC<{ studentProgress: StudentProgress[] }> = ({
  studentProgress,
}) => {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Student</TableCell>
            <TableCell>Subject</TableCell>
            <TableCell align="right">Lessons</TableCell>
            <TableCell align="right">Quizzes</TableCell>
            <TableCell align="right">Accuracy</TableCell>
            <TableCell align="right">Mastered Topics</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {studentProgress.map((progress, index) => (
            <TableRow key={index}>
              <TableCell>{progress.student_name}</TableCell>
              <TableCell>{progress.subject}</TableCell>
              <TableCell align="right">{progress.lessons_completed}</TableCell>
              <TableCell align="right">{progress.quizzes_completed}</TableCell>
              <TableCell align="right">
                {(progress.average_accuracy * 100).toFixed(0)}%
              </TableCell>
              <TableCell align="right">{progress.topics_mastered.length}</TableCell>
              <TableCell>
                {progress.average_accuracy > 0.8 ? (
                  <Chip label="Excellent" color="success" size="small" />
                ) : progress.average_accuracy > 0.6 ? (
                  <Chip label="Good" color="primary" size="small" />
                ) : (
                  <Chip label="Needs Support" color="warning" size="small" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

const ClassPerformanceTab: React.FC<{ classReports: ClassPerformanceReport[] }> = ({
  classReports,
}) => {
  return (
    <Grid container spacing={3}>
      {classReports.map((report, index) => (
        <Grid item xs={12} key={index}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {report.class_name} - {report.subject}
            </Typography>

            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="textSecondary">
                  Completion Rate
                </Typography>
                <Box display="flex" alignItems="center" sx={{ mt: 1 }}>
                  <Box width="100%" mr={1}>
                    <LinearProgress
                      variant="determinate"
                      value={report.average_completion_rate * 100}
                      sx={{ height: 10, borderRadius: 5 }}
                    />
                  </Box>
                  <Typography variant="body2">
                    {(report.average_completion_rate * 100).toFixed(0)}%
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="textSecondary">
                  Average Accuracy
                </Typography>
                <Box display="flex" alignItems="center" sx={{ mt: 1 }}>
                  <Box width="100%" mr={1}>
                    <LinearProgress
                      variant="determinate"
                      value={report.average_accuracy * 100}
                      color={report.average_accuracy > 0.7 ? 'success' : 'warning'}
                      sx={{ height: 10, borderRadius: 5 }}
                    />
                  </Box>
                  <Typography variant="body2">
                    {(report.average_accuracy * 100).toFixed(0)}%
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Top Performers ({report.top_performers.length})
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {report.top_performers.map((studentId) => (
                    <Chip
                      key={studentId}
                      label={`Student ${studentId}`}
                      color="success"
                      size="small"
                      icon={<TrendingUp />}
                    />
                  ))}
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  Needs Support ({report.struggling_students.length})
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {report.struggling_students.map((studentId) => (
                    <Chip
                      key={studentId}
                      label={`Student ${studentId}`}
                      color="warning"
                      size="small"
                      icon={<Warning />}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
};

const CurriculumCoverageTab: React.FC<{ coverageReports: CurriculumCoverageReport[] }> = ({
  coverageReports,
}) => {
  return (
    <Grid container spacing={3}>
      {coverageReports.map((report, index) => (
        <Grid item xs={12} md={6} key={index}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {report.subject}
            </Typography>

            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="textSecondary">
                Coverage Progress
              </Typography>
              <Box display="flex" alignItems="center" sx={{ mt: 1 }}>
                <Box width="100%" mr={1}>
                  <LinearProgress
                    variant="determinate"
                    value={report.coverage_percentage}
                    sx={{ height: 10, borderRadius: 5 }}
                  />
                </Box>
                <Typography variant="body2">
                  {report.coverage_percentage.toFixed(0)}%
                </Typography>
              </Box>
            </Box>

            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={4}>
                <Typography variant="body2" color="textSecondary">
                  Total Topics
                </Typography>
                <Typography variant="h6">{report.total_topics}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="body2" color="textSecondary">
                  Covered
                </Typography>
                <Typography variant="h6" color="primary">
                  {report.topics_covered}
                </Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="body2" color="textSecondary">
                  Mastered
                </Typography>
                <Typography variant="h6" color="success.main">
                  {report.topics_mastered}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
};

export default EducatorDashboard;
