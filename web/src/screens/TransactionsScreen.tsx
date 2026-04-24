import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Fab,
  Drawer,
  Divider,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel,
  Stack,
  Checkbox,
  DialogContentText,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as CreditIcon,
  ArrowDownward as DebitIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  AccountBalance as AccountIcon,
  People as PersonIcon,
  Apps as CategoryIcon,
  DateRange as DateIcon,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import {
  listTransactionsByYearMonth,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  bulkDeleteTransactions,
  bulkUpdateTransactions,
  uploadTransactionsExcel,
  listTransactionUploads,
  listTransactionYearsOptions,
  TRANSACTION_PERSONAL_TYPES,
  Transaction,
  TransactionPersonalType,
  TransactionCreateInput,
  TRANSACTION_TXN_TYPES,
  type TransactionTxnType,
} from "../services/transactions";
import { listAccounts } from "../services/accounts";
import { listPeoples } from "../services/peoples";
import { listCategories } from "../services/categories";
import { groupLedgerRowsByYearMonth } from "../utils/ledgerGrouping";

// Filter types
type TxnVisibilityFilter = "visible" | "hidden" | "all";
type TxnPersonLinkedFilter = "all" | "linked" | "unlinked";
type TxnRemarkLinkedFilter = "all" | "linked" | "unlinked";
type DateFilterMode = "period" | "all" | "custom";

export default function TransactionsScreen() {
  type Lookup = { id: string; name: string };
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metaLoading, setMetaLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [formData, setFormData] = useState<TransactionCreateInput>({
    description: "",
    amount: "0",
    type: "debit",
    txn_type: "expense",
    txn_date: dayjs().format("YYYY-MM-DD"),
    account: 1,
  });

  // Filter states
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [filterAmountExact, setFilterAmountExact] = useState("");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");
  const [filterSpecificDate, setFilterSpecificDate] = useState("");
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [filterPersonId, setFilterPersonId] = useState<string | null>(null);
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [filterTxnType, setFilterTxnType] = useState<"credit" | "debit" | null>(
    null,
  );
  const [filterTxnKind, setFilterTxnKind] = useState<TransactionTxnType | null>(
    null,
  );
  const [filterVisibility, setFilterVisibility] =
    useState<TxnVisibilityFilter>("visible");
  const [filterPersonLinked, setFilterPersonLinked] =
    useState<TxnPersonLinkedFilter>("all");
  const [filterRemarkLinked, setFilterRemarkLinked] =
    useState<TxnRemarkLinkedFilter>("all");
  const [dateFilterMode, setDateFilterMode] =
    useState<DateFilterMode>("period");
  const [selectedYear, setSelectedYear] = useState(dayjs().year().toString());
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month() + 1);
  const [customStartDate, setCustomStartDate] = useState<string | null>(null);
  const [customEndDate, setCustomEndDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [accounts, setAccounts] = useState<Lookup[]>([]);
  const [people, setPeople] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [accountSearchDebounced, setAccountSearchDebounced] = useState("");
  const [personSearchDebounced, setPersonSearchDebounced] = useState("");
  const [categorySearchDebounced, setCategorySearchDebounced] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [yearsOptions, setYearsOptions] = useState<string[]>([
    String(dayjs().year()),
  ]);
  const [selectedTxnIds, setSelectedTxnIds] = useState<string[]>([]);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkPerson, setBulkPerson] = useState<string>("__keep__");
  const [bulkCategory, setBulkCategory] = useState<string>("__keep__");
  const [bulkTxnType, setBulkTxnType] = useState<string>("__keep__");
  const [bulkPersonalType, setBulkPersonalType] = useState<string>("__keep__");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadAccount, setUploadAccount] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadListOpen, setIsUploadListOpen] = useState(false);
  const [uploads, setUploads] = useState<any[]>([]);
  const [summary, setSummary] = useState<{
    total_credit: string;
    total_debit: string;
    total_flow: string;
  }>({
    total_credit: "0.00",
    total_debit: "0.00",
    total_flow: "0.00",
  });

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchInput.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = setTimeout(() => setAccountSearchDebounced(accountSearch.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [accountSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setPersonSearchDebounced(personSearch.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [personSearch]);

  useEffect(() => {
    const timer = setTimeout(
      () => setCategorySearchDebounced(categorySearch.trim().toLowerCase()),
      300
    );
    return () => clearTimeout(timer);
  }, [categorySearch]);

  // Build filter params
  const filterParams = useMemo(() => {
    const params: any = {
      page,
      page_size: pageSize,
    };

    if (searchDebounced) params.description = searchDebounced;
    if (filterAmountExact) params.amount = filterAmountExact;
    if (filterAmountMin) params.amount_min = filterAmountMin;
    if (filterAmountMax) params.amount_max = filterAmountMax;
    if (filterSpecificDate) params.specific_date = filterSpecificDate;
    if (filterAccountId) params.account = filterAccountId;
    if (filterPersonId) params.person = filterPersonId;
    if (filterCategoryId) params.category = filterCategoryId;
    if (filterTxnType) params.type = filterTxnType;
    if (filterTxnKind) params.txn_type = filterTxnKind;
    if (filterVisibility !== "visible") {
      if (filterVisibility === "all") params.include_hidden = true;
      else if (filterVisibility === "hidden") params.show = "hidden";
    }
    if (filterPersonLinked !== "all") {
      params.ispersonthere = filterPersonLinked;
    }
    if (filterRemarkLinked !== "all") {
      params.isremarkthere = filterRemarkLinked;
    }

    // Date filtering
    if (dateFilterMode === "period") {
      params.year = selectedYear;
      params.month = selectedMonth;
    } else if (
      dateFilterMode === "custom" &&
      (customStartDate !== null || customEndDate !== null)
    ) {
      params.start_date = customStartDate;
      params.end_date = customEndDate;
    } else if (dateFilterMode === "all") {
      // No date filters
    }

    return params;
  }, [
    searchDebounced,
    filterAmountExact,
    filterAmountMin,
    filterAmountMax,
    filterSpecificDate,
    filterAccountId,
    filterPersonId,
    filterCategoryId,
    filterTxnType,
    filterTxnKind,
    filterVisibility,
    filterPersonLinked,
    filterRemarkLinked,
    dateFilterMode,
    selectedYear,
    selectedMonth,
    customStartDate,
    customEndDate,
    page,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    searchDebounced,
    filterAmountExact,
    filterAmountMin,
    filterAmountMax,
    filterSpecificDate,
    filterAccountId,
    filterPersonId,
    filterCategoryId,
    filterTxnType,
    filterTxnKind,
    filterVisibility,
    filterPersonLinked,
    filterRemarkLinked,
    dateFilterMode,
    selectedYear,
    selectedMonth,
    customStartDate,
    customEndDate,
  ]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setMetaLoading(true);
        const [accRes, pplRes, catRes] = await Promise.all([
          listAccounts(),
          listPeoples(),
          listCategories(),
        ]);
        if (!mounted) return;
        const acc = accRes.map((a) => ({ id: String(a.id), name: a.name }));
        const ppl = pplRes.map((p) => ({ id: String(p.id), name: p.name }));
        const cat = catRes.map((c) => ({ id: String(c.id), name: c.name }));
        setAccounts(acc);
        setPeople(ppl);
        setCategories(cat);
        const years = await listTransactionYearsOptions();
        if (years.length > 0) {
          setYearsOptions(years);
          if (!years.includes(selectedYear)) {
            setSelectedYear(years[years.length - 1]);
          }
        }

        if (acc.length > 0) {
          setFormData((prev) => ({
            ...prev,
            account: prev.account ?? acc[0].id,
          }));
        }
      } catch (err) {
        if (mounted) {
          setError("Failed to load accounts/people/categories.");
        }
      } finally {
        if (mounted) setMetaLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [filterParams]);

  async function loadTransactions() {
    try {
      setLoading(true);
      const response = await listTransactionsByYearMonth(filterParams);
      setTransactions(response.results);
      setTotalCount(response.count);
      setSummary({
        total_credit: response.total_credit,
        total_debit: response.total_debit,
        total_flow: response.total_flow,
      });
      const visible = new Set(response.results.map((t) => String(t.id)));
      setSelectedTxnIds((prev) => prev.filter((id) => visible.has(id)));
    } catch (err: any) {
      setError("Failed to load transactions");
      console.error("Error loading transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, formData);
      } else {
        await createTransaction(formData);
      }
      await loadTransactions();
      handleCloseDialog();
    } catch (err: any) {
      setError("Failed to save transaction");
      console.error("Error saving transaction:", err);
    }
  }

  async function handleDelete(id: string | number) {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      try {
        await deleteTransaction(id);
        await loadTransactions();
      } catch (err: any) {
        setError("Failed to delete transaction");
        console.error("Error deleting transaction:", err);
      }
    }
  }

  function toggleTxnSelection(id: string | number) {
    const k = String(id);
    setSelectedTxnIds((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  }

  function toggleSelectAllVisible() {
    const ids = transactions.map((t) => String(t.id));
    const allSelected = ids.length > 0 && ids.every((id) => selectedTxnIds.includes(id));
    setSelectedTxnIds((prev) =>
      allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))
    );
  }

  async function onBulkDeleteSelected() {
    if (selectedTxnIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedTxnIds.length} selected transactions?`)) return;
    try {
      await bulkDeleteTransactions({ ids: selectedTxnIds });
      setSelectedTxnIds([]);
      await loadTransactions();
    } catch {
      setError("Failed bulk delete.");
    }
  }

  async function onApplyBulkUpdate() {
    if (selectedTxnIds.length === 0) return;
    const payload: any = { ids: selectedTxnIds };
    if (bulkPerson !== "__keep__") payload.person = bulkPerson === "__none__" ? null : bulkPerson;
    if (bulkCategory !== "__keep__")
      payload.category = bulkCategory === "__none__" ? null : bulkCategory;
    if (bulkTxnType !== "__keep__") payload.txn_type = bulkTxnType as TransactionTxnType;
    if (bulkPersonalType !== "__keep__") {
      payload.personal_type =
        bulkPersonalType === "__none__" ? null : (bulkPersonalType as TransactionPersonalType);
    }
    try {
      await bulkUpdateTransactions(payload);
      setIsBulkDialogOpen(false);
      setSelectedTxnIds([]);
      await loadTransactions();
    } catch {
      setError("Failed bulk update.");
    }
  }

  async function onUploadExcel() {
    if (!uploadFile || !uploadAccount) return;
    try {
      setIsUploading(true);
      await uploadTransactionsExcel({
        account: uploadAccount,
        file: {
          uri: "",
          name: uploadFile.name,
          mimeType: uploadFile.type || "application/octet-stream",
          fileObject: uploadFile,
        },
      });
      setIsUploadDialogOpen(false);
      setUploadFile(null);
      await loadTransactions();
    } catch {
      setError("Failed to upload transactions file.");
    } finally {
      setIsUploading(false);
    }
  }

  async function openUploadList() {
    try {
      const list = await listTransactionUploads();
      setUploads(list);
      setIsUploadListOpen(true);
    } catch {
      setError("Failed to load upload history.");
    }
  }

  function clearAllFilters() {
    setSearchInput("");
    setFilterAmountExact("");
    setFilterAmountMin("");
    setFilterAmountMax("");
    setFilterSpecificDate("");
    setFilterAccountId(null);
    setFilterPersonId(null);
    setFilterCategoryId(null);
    setFilterTxnType(null);
    setFilterTxnKind(null);
    setFilterVisibility("visible");
    setFilterPersonLinked("all");
    setFilterRemarkLinked("all");
    setDateFilterMode("period");
    setCustomStartDate(null);
    setCustomEndDate(null);
  }

  function hasActiveFilters() {
    return (
      searchInput ||
      filterAmountExact ||
      filterAmountMin ||
      filterAmountMax ||
      filterSpecificDate ||
      filterAccountId ||
      filterPersonId ||
      filterCategoryId ||
      filterTxnType ||
      filterTxnKind ||
      filterVisibility !== "visible" ||
      filterPersonLinked !== "all" ||
      filterRemarkLinked !== "all" ||
      (dateFilterMode === "custom" &&
        (customStartDate !== null || customEndDate !== null))
    );
  }

  function handleOpenDialog(transaction?: Transaction) {
    if (transaction) {
      setEditingTransaction(transaction);
      setFormData({
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        txn_type: transaction.txn_type,
        txn_date: transaction.txn_date,
        account: transaction.account,
        person: transaction.person || undefined,
        category: transaction.category || undefined,
        remark: transaction.remark || undefined,
        ref_no_or_cheque_no: transaction.ref_no_or_cheque_no || undefined,
        personal_type: transaction.personal_type || undefined,
      });
    } else {
      setEditingTransaction(null);
      setFormData({
        description: "",
        amount: "0",
        type: "debit",
        txn_type: "expense",
        txn_date: dayjs().format("YYYY-MM-DD"),
        account: accounts[0]?.id ?? 1,
      });
    }
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
    setEditingTransaction(null);
    setError("");
  }

  const grouped = useMemo(
    () => groupLedgerRowsByYearMonth(transactions),
    [transactions]
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const filteredAccounts = useMemo(
    () =>
      accounts.filter((a) =>
        accountSearchDebounced ? a.name.toLowerCase().includes(accountSearchDebounced) : true
      ),
    [accounts, accountSearchDebounced]
  );
  const filteredPeople = useMemo(
    () =>
      people.filter((p) =>
        personSearchDebounced ? p.name.toLowerCase().includes(personSearchDebounced) : true
      ),
    [people, personSearchDebounced]
  );
  const filteredCategories = useMemo(
    () =>
      categories.filter((c) =>
        categorySearchDebounced ? c.name.toLowerCase().includes(categorySearchDebounced) : true
      ),
    [categories, categorySearchDebounced]
  );

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
          Transactions
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {metaLoading && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Loading accounts, people, and categories...
          </Alert>
        )}

        {/* Search and Filter Bar */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                placeholder="Search transactions..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
                }}
                sx={{ flex: 1 }}
              />
              <TextField
                placeholder="Amount"
                value={filterAmountExact}
                onChange={(e) => setFilterAmountExact(e.target.value)}
                type="number"
                sx={{ width: 120 }}
              />
              <IconButton
                onClick={() => setIsFilterDrawerOpen(true)}
                color={hasActiveFilters() ? "primary" : "default"}
              >
                <FilterIcon />
              </IconButton>
              <Button variant="outlined" onClick={() => setIsUploadDialogOpen(true)}>
                Upload
              </Button>
              <Button variant="outlined" onClick={openUploadList}>
                Upload List
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={3}>
              <Typography variant="body2">Credit: {summary.total_credit}</Typography>
              <Typography variant="body2">Debit: {summary.total_debit}</Typography>
              <Typography variant="body2">Flow: {summary.total_flow}</Typography>
            </Stack>
          </CardContent>
        </Card>

        {selectedTxnIds.length > 0 && (
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2">{selectedTxnIds.length} selected</Typography>
                <Button size="small" onClick={toggleSelectAllVisible}>
                  Toggle all visible
                </Button>
                <Button size="small" variant="outlined" onClick={() => setIsBulkDialogOpen(true)}>
                  Bulk update
                </Button>
                <Button size="small" color="error" variant="outlined" onClick={onBulkDeleteSelected}>
                  Bulk delete
                </Button>
                <Button size="small" onClick={() => setSelectedTxnIds([])}>
                  Clear
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Date Filter Pills */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ mr: 1 }}>
                Period:
              </Typography>
              <Chip
                label="Period"
                onClick={() => setDateFilterMode("period")}
                color={dateFilterMode === "period" ? "primary" : "default"}
                clickable
              />
              <Chip
                label="All Time"
                onClick={() => setDateFilterMode("all")}
                color={dateFilterMode === "all" ? "primary" : "default"}
                clickable
              />
              <Chip
                label="Custom"
                onClick={() => setDateFilterMode("custom")}
                color={dateFilterMode === "custom" ? "primary" : "default"}
                clickable
              />
              {dateFilterMode === "period" && (
                <Box
                  sx={{ ml: 2, display: "flex", gap: 1, alignItems: "center" }}
                >
                  <Select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value as string)}
                    size="small"
                    sx={{ minWidth: 80 }}
                  >
                    {yearsOptions.map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                  <Select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value as number)}
                    size="small"
                    sx={{ minWidth: 100 }}
                  >
                    {[
                      "Jan",
                      "Feb",
                      "Mar",
                      "Apr",
                      "May",
                      "Jun",
                      "Jul",
                      "Aug",
                      "Sep",
                      "Oct",
                      "Nov",
                      "Dec",
                    ].map((month, index) => (
                      <MenuItem key={month} value={index + 1}>
                        {month}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Filter Drawer */}
        <Drawer
          anchor="right"
          open={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
        >
          <Box sx={{ width: 360, p: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6">Filters</Typography>
              <IconButton onClick={() => setIsFilterDrawerOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Box>

            <Stack spacing={3}>
              {/* Account Filter */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Account</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <TextField
                      size="small"
                      placeholder="Search account..."
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                    />
                    <Chip
                      label="All"
                      onClick={() => setFilterAccountId(null)}
                      color={filterAccountId === null ? "primary" : "default"}
                      clickable
                    />
                    {filteredAccounts.map((account) => (
                      <Chip
                        key={account.id}
                        label={account.name}
                        onClick={() => setFilterAccountId(account.id)}
                        color={
                          filterAccountId === account.id ? "primary" : "default"
                        }
                        clickable
                      />
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Person Filter */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Person</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <TextField
                      size="small"
                      placeholder="Search person..."
                      value={personSearch}
                      onChange={(e) => setPersonSearch(e.target.value)}
                    />
                    <Chip
                      label="All"
                      onClick={() => setFilterPersonId(null)}
                      color={filterPersonId === null ? "primary" : "default"}
                      clickable
                    />
                    {filteredPeople.map((person) => (
                      <Chip
                        key={person.id}
                        label={person.name}
                        onClick={() => setFilterPersonId(person.id)}
                        color={
                          filterPersonId === person.id ? "primary" : "default"
                        }
                        clickable
                      />
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Category Filter */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Category</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <TextField
                      size="small"
                      placeholder="Search category..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                    />
                    <Chip
                      label="All"
                      onClick={() => setFilterCategoryId(null)}
                      color={filterCategoryId === null ? "primary" : "default"}
                      clickable
                    />
                    {filteredCategories.map((category) => (
                      <Chip
                        key={category.id}
                        label={category.name}
                        onClick={() => setFilterCategoryId(category.id)}
                        color={
                          filterCategoryId === category.id
                            ? "primary"
                            : "default"
                        }
                        clickable
                      />
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Transaction Type Filter */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Transaction Type</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <Chip
                      label="All"
                      onClick={() => setFilterTxnType(null)}
                      color={filterTxnType === null ? "primary" : "default"}
                      clickable
                    />
                    <Chip
                      label="Credit"
                      onClick={() => setFilterTxnType("credit")}
                      color={filterTxnType === "credit" ? "primary" : "default"}
                      clickable
                    />
                    <Chip
                      label="Debit"
                      onClick={() => setFilterTxnType("debit")}
                      color={filterTxnType === "debit" ? "primary" : "default"}
                      clickable
                    />
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Transaction Kind Filter */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Transaction Kind</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    <Chip
                      label="All"
                      onClick={() => setFilterTxnKind(null)}
                      color={filterTxnKind === null ? "primary" : "default"}
                      clickable
                    />
                    {TRANSACTION_TXN_TYPES.map((kind) => (
                      <Chip
                        key={kind}
                        label={kind.charAt(0).toUpperCase() + kind.slice(1)}
                        onClick={() => setFilterTxnKind(kind)}
                        color={filterTxnKind === kind ? "primary" : "default"}
                        clickable
                      />
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Amount Range Filter */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Amount Range</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <TextField
                      label="Min Amount"
                      type="number"
                      value={filterAmountMin}
                      onChange={(e) => setFilterAmountMin(e.target.value)}
                      size="small"
                    />
                    <TextField
                      label="Max Amount"
                      type="number"
                      value={filterAmountMax}
                      onChange={(e) => setFilterAmountMax(e.target.value)}
                      size="small"
                    />
                  </Stack>
                </AccordionDetails>
              </Accordion>

              {/* Specific Date Filter */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">Specific Date</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TextField
                    label="Date (YYYY-MM-DD)"
                    value={filterSpecificDate}
                    onChange={(e) => setFilterSpecificDate(e.target.value)}
                    size="small"
                    placeholder="2024-01-15"
                  />
                </AccordionDetails>
              </Accordion>

              {/* Custom Date Range */}
              {dateFilterMode === "custom" && (
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="body2">Custom Date Range</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={2}>
                      <DatePicker
                        label="Start Date"
                        value={customStartDate ? dayjs(customStartDate) : null}
                        onChange={(newValue) =>
                          setCustomStartDate(
                            newValue ? newValue.format("YYYY-MM-DD") : null,
                          )
                        }
                      />
                      <DatePicker
                        label="End Date"
                        value={customEndDate ? dayjs(customEndDate) : null}
                        onChange={(newValue) =>
                          setCustomEndDate(
                            newValue ? newValue.format("YYYY-MM-DD") : null,
                          )
                        }
                      />
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Clear Filters Button */}
              <Button
                variant="outlined"
                onClick={clearAllFilters}
                disabled={!hasActiveFilters()}
                fullWidth
              >
                Clear All Filters
              </Button>
            </Stack>
          </Box>
        </Drawer>

        <Card>
          <CardContent sx={{ p: 0 }}>
            <List>
              {transactions.length === 0 ? (
                <ListItem>
                  <ListItemText
                    primary="No transactions found"
                    secondary={
                      hasActiveFilters()
                        ? "Try adjusting your filters"
                        : "Add your first transaction to get started"
                    }
                  />
                </ListItem>
              ) : (
                grouped.map((yg) => (
                  <Box key={yg.year}>
                    <ListItem>
                      <ListItemText primary={String(yg.year)} />
                    </ListItem>
                    {yg.months.map((mg) => (
                      <Box key={`${yg.year}-${mg.month}`}>
                        <ListItem>
                          <ListItemText
                            primary={mg.label}
                            secondary={
                              <Button size="small" onClick={toggleSelectAllVisible}>
                                Select all visible
                              </Button>
                            }
                          />
                        </ListItem>
                        {mg.transactions.map((transaction) => (
                          <ListItem
                            key={transaction.id}
                            divider
                            secondaryAction={
                              <Box sx={{ display: "flex", gap: 1 }}>
                                <IconButton size="small" onClick={() => handleOpenDialog(transaction)}>
                                  <EditIcon />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDelete(transaction.id)}>
                                  <DeleteIcon />
                                </IconButton>
                              </Box>
                            }
                          >
                            <Box sx={{ display: "flex", alignItems: "center", width: "100%", gap: 2 }}>
                              <Checkbox
                                checked={selectedTxnIds.includes(String(transaction.id))}
                                onChange={() => toggleTxnSelection(transaction.id)}
                              />
                              {transaction.type === "credit" ? (
                                <CreditIcon color="success" />
                              ) : (
                                <DebitIcon color="error" />
                              )}
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body1">{transaction.description}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {dayjs(transaction.txn_date).format("MMM D, YYYY")} - {transaction.txn_type}
                                </Typography>
                              </Box>
                              <Box sx={{ textAlign: "right" }}>
                                <Typography
                                  variant="body1"
                                  sx={{
                                    color: transaction.type === "credit" ? "success.main" : "error.main",
                                  }}
                                >
                                  {transaction.type === "credit" ? "+" : "-"}${transaction.amount}
                                </Typography>
                              </Box>
                            </Box>
                          </ListItem>
                        ))}
                      </Box>
                    ))}
                  </Box>
                ))
              )}
            </List>
          </CardContent>
        </Card>
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
              <Typography variant="body2">
                Page {page} of {totalPages} ({totalCount} records)
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="small"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Fab
          color="primary"
          aria-label="add transaction"
          sx={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={() => handleOpenDialog()}
        >
          <AddIcon />
        </Fab>

        <Dialog
          open={isDialogOpen}
          onClose={handleCloseDialog}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {editingTransaction ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
          <form onSubmit={handleSubmit}>
            <DialogContent>
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
              >
                <TextField
                  label="Description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                  fullWidth
                />

                <TextField
                  label="Amount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  required
                  fullWidth
                  inputProps={{ step: "0.01", min: "0" }}
                />

                <FormControl fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        type: e.target.value as "credit" | "debit",
                      })
                    }
                    label="Type"
                  >
                    <MenuItem value="credit">Credit (Income)</MenuItem>
                    <MenuItem value="debit">Debit (Expense)</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Transaction Type</InputLabel>
                  <Select
                    value={formData.txn_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        txn_type: e.target.value as any,
                      })
                    }
                    label="Transaction Type"
                  >
                    {TRANSACTION_TXN_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <DatePicker
                  label="Date"
                  value={dayjs(formData.txn_date)}
                  onChange={(newValue) => {
                    if (newValue) {
                      setFormData({
                        ...formData,
                        txn_date: newValue.format("YYYY-MM-DD"),
                      });
                    }
                  }}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>Cancel</Button>
              <Button type="submit" variant="contained">
                {editingTransaction ? "Update" : "Create"}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        <Dialog open={isBulkDialogOpen} onClose={() => setIsBulkDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Bulk update</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Person</InputLabel>
                <Select value={bulkPerson} label="Person" onChange={(e) => setBulkPerson(String(e.target.value))}>
                  <MenuItem value="__keep__">Keep unchanged</MenuItem>
                  <MenuItem value="__none__">Remove person</MenuItem>
                  {people.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={bulkCategory} label="Category" onChange={(e) => setBulkCategory(String(e.target.value))}>
                  <MenuItem value="__keep__">Keep unchanged</MenuItem>
                  <MenuItem value="__none__">Remove category</MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Txn type</InputLabel>
                <Select value={bulkTxnType} label="Txn type" onChange={(e) => setBulkTxnType(String(e.target.value))}>
                  <MenuItem value="__keep__">Keep unchanged</MenuItem>
                  {TRANSACTION_TXN_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Personal type</InputLabel>
                <Select
                  value={bulkPersonalType}
                  label="Personal type"
                  onChange={(e) => setBulkPersonalType(String(e.target.value))}
                >
                  <MenuItem value="__keep__">Keep unchanged</MenuItem>
                  <MenuItem value="__none__">Remove personal type</MenuItem>
                  {TRANSACTION_PERSONAL_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsBulkDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={() => void onApplyBulkUpdate()}>
              Apply
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={isUploadDialogOpen} onClose={() => setIsUploadDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Upload transactions file</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Account</InputLabel>
                <Select
                  value={uploadAccount}
                  label="Account"
                  onChange={(e) => setUploadAccount(String(e.target.value))}
                >
                  {accounts.map((a) => (
                    <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="outlined" component="label">
                Pick file
                <input
                  type="file"
                  hidden
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              <DialogContentText>
                {uploadFile ? uploadFile.name : "No file selected"}
              </DialogContentText>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!uploadFile || !uploadAccount || isUploading}
              onClick={() => void onUploadExcel()}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={isUploadListOpen} onClose={() => setIsUploadListOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Upload history</DialogTitle>
          <DialogContent>
            <List>
              {uploads.length === 0 ? (
                <ListItem>
                  <ListItemText primary="No uploads yet." />
                </ListItem>
              ) : (
                uploads.map((u, idx) => (
                  <ListItem key={`${u.file}-${idx}`} divider>
                    <ListItemText
                      primary={u.file}
                      secondary={`Rows ${u.total_rows}, created ${u.created_count}, dup ${u.duplicate_count}, errors ${u.error_count}`}
                    />
                  </ListItem>
                ))
              )}
            </List>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsUploadListOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
}
